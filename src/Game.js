
import { Map } from './Map.js';
import { Unit } from './Unit.js';
import { Tower } from './Tower.js';
import { EffectManager } from './Effects.js';
import { AudioManager } from './AudioManager.js';

// New Architecture Imports
import { GameState } from './GameState.js';
import { GameLoop } from './GameLoop.js';
import { Renderer } from './Renderer.js';
import { NetworkManager } from './NetworkManager.js';
import { InputManager, CommandType } from './InputManager.js';

export class Game {
    constructor(canvas) {
        // --- 1. Infrastructure ---
        this.canvas = canvas;
        this.audio = new AudioManager();
        this.map = new Map(this); // Map needs game ref for assets? Or just Context? 
        // Map constructor usually takes (game).

        // --- 2. State Layer ---
        this.state = new GameState();

        // --- 3. Proxies for Legacy Code (Unit/Tower compatibility) ---
        // Unit.js uses game.units, game.defenderLives, etc.
        // We link them to state.

        // --- 4. Network Layer ---
        this.network = new NetworkManager();
        this.network.setCommandHandler((cmd) => this.executeCommand(cmd));

        // Listen for Role Assignment
        this.network.onRoleAssigned = (role) => {
            console.log(`[Game] Role Assigned: ${role.toUpperCase()}`);
            this.role = role;
            this.renderCards();

            // Visual Indicator
            const roleBtn = document.getElementById('role-switch-btn');
            if (roleBtn) {
                roleBtn.innerText = `Role: ${role.toUpperCase()}`;
                roleBtn.disabled = true; // Lock it
                roleBtn.style.opacity = "0.7";
                roleBtn.style.cursor = "default";
            }
        };

        this.network.onPeerDiscovered = () => {
            console.log("[Game] Peer Discovered attempting to sync state...");
            if (this.localReady) {
                console.log("[Game] Re-broadcasting READY state to new peer.");
                this.network.sendCommand({ type: CommandType.READY });
            }
        };

        // Start Connection Logic NOW, after listeners are ready
        this.network.connect();

        // --- 5. Input Layer ---
        this.input = new InputManager(canvas, this.map, this.network, this.state);
        this.input.setupListeners(); // Ensure we actually start listening!

        // --- 6. View Layer ---
        this.renderer = new Renderer(canvas);
        this.effects = new EffectManager(this); // Effects might need proxies too

        // --- 7. Control Layer ---
        this.loop = new GameLoop(
            (dt) => this.update(dt),
            (ts) => this.render(ts)
        );

        // --- 8. UI/Game Flow ---
        // (Keep Setup Logic from old Game.js)
        this.paused = true;
        this.gameStarted = false;

        this.role = 'attacker'; // Local Player Role
        this.setupUI();     // Re-implement or adapt
        this.setupMenu();   // Re-implement or adapt
        this.setupWelcome(); // Re-implement OR adapt

        // Initial Resize
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Right Click Cancel
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.deselectAll();
        });
    }

    deselectAll() {
        this.input.selectedCard = null;
        this.input.selectedEntity = null;
        // Update UI visuals
        const prev = document.querySelector('.card.selected');
        if (prev) prev.classList.remove('selected');
        this.renderCards(); // Refresh dock state if needed
        this.updateUI(); // Hide sell button
    }

    // --- State Proxies for Unit/Tower/Effects ---
    get units() { return this.state.units; }
    set units(v) { this.state.units = v; }

    get towers() { return this.state.towers; }
    set towers(v) { this.state.towers = v; }

    get projectiles() { return this.state.projectiles; }
    set projectiles(v) { this.state.projectiles = v; }

    get defenderLives() { return this.state.lives; }
    set defenderLives(v) { this.state.lives = v; }

    get attackerGold() { return this.state.gold; }
    set attackerGold(v) { this.state.gold = v; }


    // --- Core Loops ---
    start() {
        this.loop.start();
    }

    update(deltaTime) {
        if (!this.gameStarted || this.paused) return;

        this.state.time += deltaTime;

        // Update Entities
        // Note: Unit.update(dt) currently handles movement, logic, AND physics.
        // In a pure ECS, this would be System loops. 
        // Here we delegate to the Entity Class (Fat Model).

        this.map.update(deltaTime); // Map might have logic?

        this.state.units.forEach(u => u.update(deltaTime));
        this.state.units = this.state.units.filter(u => u.active);

        this.state.towers.forEach(t => t.update(deltaTime)); // Towers might shoot (create projectiles)
        this.state.towers = this.state.towers.filter(t => t.active);

        this.state.projectiles.forEach(p => p.update(deltaTime));
        this.state.projectiles = this.state.projectiles.filter(p => p.active);

        this.effects.update(deltaTime);

        // Shake Decay handled in Renderer? Or State?
        // Old code had this.shake. Let's proxy shake too if needed, or move to Renderer.
        // For now, let's assume effects handles shake or we omit it for MVP refactor.

        this.updateUI(); // Keep UI updates
    }

    render(timestamp) {
        // Delegate to Renderer
        this.renderer.draw(this.state, this.map);

        // Effects are strictly visual, so Renderer should probably draw them?
        // OR we draw them on top here.
        // Original Game.js: effects.render(ctx, map) was at end of render.
        this.effects.render(this.renderer.ctx, this.map);
    }

    // --- Command Execution ---
    executeCommand(cmd) {
        console.log("Executing", cmd);

        if (cmd.type === CommandType.READY) {
            // Ignore our own Ready signal (handled by UI click)
            if (cmd.playerId === this.network.clientId) return;

            console.log(`[Game] Opponent ${cmd.playerId} is READY`);
            this.remoteReady = true;
            this.checkStartCondition();

            // Update Text if waiting
            const statusParams = document.querySelector('#welcome-screen p');
            if (statusParams && !this.gameStarted) {
                statusParams.innerText = "Opponent is Ready! Waiting for you...";
                statusParams.style.color = "#00ff00";
            }
        }

        if (cmd.type === CommandType.SPAWN_UNIT) {
            // Logic moved from spawnUnit
            // Validation: Check Gold?
            // If validation passes:
            if (this.map.path.length > 0) {
                // Ensure we have enough gold?
                // Logic says: if (this.attackerGold >= cost) ...
                // Let's assume unlimited or check cost.
                // For MVP: Just spawn.
                this.state.units.push(new Unit(this, this.map.path, cmd.unitType));
                // Cost deduction logic should be here.
            }
        }
        else if (cmd.type === CommandType.PLACE_TOWER) {
            // Logic moved from tryPlaceTower
            // Check if slot free
            const range = 40;
            const slot = this.map.towerSlots.find(s => {
                const dx = s.x - cmd.x;
                const dy = s.y - cmd.y;
                return Math.sqrt(dx * dx + dy * dy) < range && !s.occupied;
            });

            if (slot) {
                this.state.towers.push(new Tower(this, slot.x, slot.y, cmd.towerType));
                slot.occupied = true;
                this.audio.playPlacingTower();
            }
        }
        else if (cmd.type === CommandType.SELL_TOWER) {
            // FIND and SELL
            const tower = this.state.towers.find(t => t.x === cmd.x && t.y === cmd.y);
            if (tower) {
                tower.active = false; // Mark for removal

                // Free slot
                const slot = this.map.towerSlots.find(s => Math.abs(s.x - cmd.x) < 5 && Math.abs(s.y - cmd.y) < 5);
                if (slot) slot.occupied = false;

                // Refund?
                // this.attackerGold += ... wait, defender doesn't have gold? 
                // Currently gold is attackerGold in constructor.
                // Assuming defender has money too, but not implemented in old Game.js yet?
                // Ah, lives only.
            }
        }
    }


    // --- Lobby Logic ---
    checkStartCondition() {
        if (this.localReady && this.remoteReady && !this.gameStarted) {
            console.log("[Game] Both Players Ready! STARTING!");
            this.startGameplay();
        }
    }

    startGameplay() {
        this.gameStarted = true;
        const welcomeScreen = document.getElementById('welcome-screen');
        const hudTop = document.getElementById('hud-top');
        const cardDock = document.getElementById('card-dock');
        const roleBtn = document.getElementById('role-switch-btn');
        const menuBtn = document.getElementById('menu-btn');

        if (welcomeScreen) welcomeScreen.classList.add('hidden');
        if (hudTop) hudTop.classList.remove('hidden');
        if (cardDock) cardDock.classList.remove('hidden');
        if (roleBtn) roleBtn.classList.remove('hidden');
        if (menuBtn) menuBtn.classList.remove('hidden');

        this.paused = false;
        this.lastTime = performance.now();
        this.start(); // Start the Loop!
    }


    // --- Legacy/UI Glue ---
    // (Adapted from old Game.js)

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.map) this.map.updateDimensions(this.canvas.width, this.canvas.height);
    }

    // ... UI Setup methods ...
    // I will copy the basic UI setup but make sure it uses InputManager

    setupWelcome() {
        const startBtn = document.getElementById('start-btn');
        const statusText = document.querySelector('#welcome-content p') || document.querySelector('#welcome-screen p');

        this.localReady = false;
        this.remoteReady = false;

        if (startBtn) {
            startBtn.innerText = "READY?";

            startBtn.addEventListener('click', () => {
                if (this.localReady) return; // Already clicked

                this.localReady = true;
                startBtn.innerText = "WAITING...";
                startBtn.disabled = true;
                startBtn.style.opacity = "0.5";

                if (statusText) statusText.innerText = "Waiting for other player...";

                // Broadcast Ready
                this.network.sendCommand({ type: CommandType.READY });

                // Check if we are second to join (opponent already ready)
                this.checkStartCondition();
            });
        }
    }

    setupUI() {
        this.uiLives = document.getElementById('defender-lives');
        this.uiGold = document.getElementById('attacker-gold');
        this.uiDock = document.getElementById('card-dock');
        this.uiSellBtn = document.getElementById('sell-btn');

        if (this.uiSellBtn) {
            this.uiSellBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.audio.playClick();
                this.input.triggerSell(); // Trigger via InputManager
            });
        }

        // Manual Role Switch REMOVED - Handled by Network
        // document.getElementById('role-switch-btn').addEventListener('click', ...

        this.renderCards();
    }

    updateUI() {
        if (this.uiLives) this.uiLives.innerText = Math.floor(this.state.lives);
        if (this.uiGold) this.uiGold.innerText = Math.floor(this.state.gold);

        // Update Sell Button Position
        if (this.input.selectedEntity && this.uiSellBtn && this.renderer) {
            // Need screen coordinates. Renderer/Map knows?
            // Map knows.
            const entity = this.input.selectedEntity;

            // Calculate Screen Coordinates using Map logic
            // (x * scale) + offsetX
            const screenX = (entity.x * this.map.scale) + this.map.offsetX;
            const screenY = (entity.y * this.map.scale) + this.map.offsetY;

            console.log(`[UI] Show Sell Btn at ${screenX}, ${screenY}`);

            this.uiSellBtn.style.display = 'flex';
            this.uiSellBtn.style.left = `${screenX + 30}px`; // Offset to right
            this.uiSellBtn.style.top = `${screenY - 30}px`;  // Offset up
        } else if (this.uiSellBtn) {
            this.uiSellBtn.style.display = 'none';
        }
    }

    toggleRole() {
        this.role = (this.role === 'attacker') ? 'defender' : 'attacker';
        this.input.selectedCard = null; // Update InputManager state
        this.renderCards();
    }

    renderCards() {
        // ... (Same as old Game.js but setting input.selectedCard)
        this.uiDock.innerHTML = '';
        this.uiDock.className = `${this.role}-theme`;

        const items = (this.role === 'attacker')
            ? [
                { id: 'unit_basic', label: 'Grunt', img: 'assets/units/soldier/Main_soldier.png' },
                { id: 'unit_tank', label: 'Tank', img: 'assets/units/unit_tank.png' },
                { id: 'unit_golem', label: 'Golem', img: 'unit_golem.png' }
            ]
            : [
                { id: 'tower_cannon', label: 'Cannon', img: 'assets/towers/Main_tower.png' },
                { id: 'tower_mage', label: 'Mage', img: 'assets/towers/tower_mage.png' },
                { id: 'tower_tesla', label: 'Tesla', img: 'tower_tesla.png' }
            ];

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<img src="${item.img}" class="card-icon-img"><span>${item.label}</span>`;
            card.onclick = () => {
                this.audio.playClick();
                this.selectCard(item.id, card);
            };
            this.uiDock.appendChild(card);
        });
    }

    selectCard(id, element) {
        // UI Selection Visuals
        const prev = document.querySelector('.card.selected');
        if (prev) prev.classList.remove('selected');

        if (this.input.selectedCard === id) {
            this.input.selectedCard = null;
        } else {
            this.input.selectedCard = id;
            element.classList.add('selected');
        }
    }

    setupMenu() {
        // ... (Pause/Resume logic) ... 
        this.uiMenu = document.getElementById('main-menu');
        const resumeBtn = document.getElementById('resume-btn');
        const menuTrigger = document.getElementById('menu-btn');

        const toggle = () => {
            this.paused = !this.paused;
            if (this.paused) this.uiMenu.classList.remove('hidden');
            else this.uiMenu.classList.add('hidden');
        };

        if (menuTrigger) menuTrigger.addEventListener('click', toggle);
        if (resumeBtn) resumeBtn.addEventListener('click', toggle);

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') toggle();
        });
    }
}
