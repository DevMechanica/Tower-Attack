import { Map } from './Map.js';
import { Unit } from './Unit.js';
import { Tower } from './Tower.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
        this.lastTime = 0;

        this.map = new Map(this);
        this.units = [];
        this.towers = [];
        this.projectiles = []; // New array for bullets

        // Game State
        this.role = 'attacker'; // 'attacker' or 'defender'
        this.selectedCard = null; // 'unit_basic', 'tower_cannon', etc.

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.setupUI();
        this.setupInput();
    }

    setupUI() {
        this.uiRoleText = document.getElementById('role-indicator');
        this.uiDock = document.getElementById('card-dock');

        document.getElementById('role-switch-btn').addEventListener('click', () => {
            this.toggleRole();
        });

        this.renderCards();
    }

    toggleRole() {
        this.role = (this.role === 'attacker') ? 'defender' : 'attacker';
        this.selectedCard = null;
        this.uiRoleText.innerText = this.role.toUpperCase();
        this.renderCards();
    }

    renderCards() {
        this.uiDock.innerHTML = '';
        this.uiDock.className = `${this.role}-theme`;

        const items = (this.role === 'attacker')
            ? [{ id: 'unit_basic', label: 'Grunt' }, { id: 'unit_tank', label: 'Tank' }]
            : [{ id: 'tower_cannon', label: 'Cannon' }, { id: 'tower_mage', label: 'Mage' }];

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="card-icon"></div><span>${item.label}</span>`;
            card.onclick = () => this.selectCard(item.id, card);
            this.uiDock.appendChild(card);
        });
    }

    selectCard(id, element) {
        // Deselect previous
        const prev = document.querySelector('.card.selected');
        if (prev) prev.classList.remove('selected');

        if (this.selectedCard === id) {
            this.selectedCard = null; // Toggle off
        } else {
            this.selectedCard = id;
            element.classList.add('selected');
        }
    }

    setupInput() {
        this.canvas.addEventListener('mousedown', (e) => {
            const coords = this.map.getGameCoordinates(e.clientX, e.clientY);
            if (!coords) return;

            if (this.role === 'attacker' && this.selectedCard) {
                // Attacker clicks usually just spawn, but maybe we want "spawn at start"?
                // For now, clicking anywhere while card selected spawns at start (simple mobile interaction)
                this.spawnUnit(this.selectedCard);
            } else if (this.role === 'defender' && this.selectedCard) {
                // Check if clicked near a slot
                this.tryPlaceTower(coords.x, coords.y, this.selectedCard);
            }
        });
    }

    spawnUnit(type) {
        if (this.map.path.length > 0) {
            // TODO: Pass type to Unit
            this.units.push(new Unit(this, this.map.path));
            console.log(`Spawned ${type}`);
        }
    }

    tryPlaceTower(x, y, type) {
        const range = 40; // Click tolerance
        const slot = this.map.towerSlots.find(s => {
            const dx = s.x - x;
            const dy = s.y - y;
            return Math.sqrt(dx * dx + dy * dy) < range && !s.occupied;
        });

        if (slot) {
            this.towers.push(new Tower(this, slot.x, slot.y, type));
            slot.occupied = true;
            console.log(`Placed ${type} at ${slot.x}, ${slot.y}`);
            // Deselect card after placement?
            this.selectedCard = null;
            document.querySelector('.card.selected')?.classList.remove('selected');
        }
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.map) this.map.updateDimensions(this.canvas.width, this.canvas.height);
    }

    start() {
        requestAnimationFrame((ts) => this.loop(ts));
    }

    loop(timestamp) {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        this.update(deltaTime);
        this.render();
        requestAnimationFrame((ts) => this.loop(ts));
    }

    update(deltaTime) {
        this.map.update(deltaTime);
        this.units.forEach(unit => unit.update(deltaTime));
        this.units = this.units.filter(unit => unit.active);

        this.towers.forEach(tower => tower.update(deltaTime));
        this.towers = this.towers.filter(tower => tower.active); // Remove dead towers

        this.projectiles.forEach(p => p.update(deltaTime));
        this.projectiles = this.projectiles.filter(p => p.active);
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.map.render(this.ctx);

        // Draw Slots if Defender
        if (this.role === 'defender') {
            this.map.towerSlots.forEach(slot => {
                if (!slot.occupied) {
                    const sx = this.map.offsetX + slot.x * this.map.scale;
                    const sy = this.map.offsetY + slot.y * this.map.scale;

                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    this.ctx.setLineDash([5, 5]);
                    this.ctx.lineWidth = 2;
                    this.ctx.beginPath();
                    this.ctx.arc(sx, sy, 20 * this.map.scale, 0, Math.PI * 2);
                    this.ctx.stroke();
                    this.ctx.setLineDash([]);
                }
            });
        }

        this.towers.forEach(tower => tower.render(this.ctx, this.map));
        this.units.forEach(unit => unit.render(this.ctx, this.map));
        this.projectiles.forEach(p => p.render(this.ctx, this.map));
    }
}
