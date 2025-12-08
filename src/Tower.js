import { Projectile } from './Projectile.js';

export class Tower {
    constructor(game, x, y, type) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.type = type; // 'tower_cannon', 'tower_mage'

        this.range = 150;
        this.cooldown = 0;
        this.maxCooldown = 1000; // ms

        // Visuals
        this.radius = 20;
        this.color = (type === 'tower_cannon') ? 'red' : 'purple';

        this.active = true;
        this.health = 200; // Towers can be destroyed too!
        this.maxHealth = 200;
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.active = false;
            // Free the slot
            const slot = this.game.map.towerSlots.find(s => Math.abs(s.x - this.x) < 5 && Math.abs(s.y - this.y) < 5);
            if (slot) slot.occupied = false;
        }
    }

    update(deltaTime) {
        if (!this.active) return;

        if (this.cooldown > 0) {
            this.cooldown -= deltaTime;
        }

        // Target closest unit
        let target = null;
        let minDist = Infinity;

        this.game.units.forEach(unit => {
            if (!unit.active) return;
            const dx = unit.x - this.x;
            const dy = unit.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.range && dist < minDist) {
                minDist = dist;
                target = unit;
            }
        });

        if (target && this.cooldown <= 0) {
            this.shoot(target);
            this.cooldown = this.maxCooldown;
        }
    }

    shoot(target) {
        // Create projectile
        const projType = (this.type === 'tower_cannon') ? 'bullet' : 'magic';
        this.game.projectiles.push(new Projectile(this.game, this.x, this.y, target, projType));
        this.recoil = 0.2; // 20% scale bump
    }

    render(ctx, map) {
        const screenX = map.offsetX + this.x * map.scale;
        const screenY = map.offsetY + this.y * map.scale;
        const scale = map.scale;

        // Recoil decay
        if (this.recoil > 0) {
            this.recoil -= 0.05;
            if (this.recoil < 0) this.recoil = 0;
        }

        // Map internal types to asset names
        let assetName = (this.type === 'tower_mage') ? 'tower_mage' : 'Main_tower';

        // if (this.recoil > 0 && this.type === 'tower_cannon') {
        //    assetName = 'Main_tower_attack';
        // }

        const sprite = map.assets[assetName];

        // Sprite Drawing
        if (sprite && sprite.complete) {
            // Apply recoil to size
            const baseSize = 200 * scale;
            const drawSize = baseSize * (1 + this.recoil);

            ctx.drawImage(
                sprite,
                0, 0, sprite.width, sprite.height,
                screenX - drawSize / 2, screenY - drawSize / 2 - (10 * scale), drawSize, drawSize
            );
        } else {
            // Fallback Circle
            const size = this.radius * scale;
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.arc(screenX, screenY + 5 * map.scale, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY - 5 * map.scale, size * 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        // Health Bar
        if (this.health < this.maxHealth) {
            const barWidth = 40 * scale;
            const barHeight = 4 * scale;
            const barY = screenY - (40 * scale); // Above tower

            ctx.fillStyle = 'red';
            ctx.fillRect(screenX - barWidth / 2, barY, barWidth, barHeight);
            ctx.fillStyle = '#0f0';
            ctx.fillRect(screenX - barWidth / 2, barY, barWidth * (this.health / this.maxHealth), barHeight);
        }
    }
}
