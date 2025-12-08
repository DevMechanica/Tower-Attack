import { Projectile } from './Projectile.js';

export class Unit {
    constructor(game, path, type) {
        this.game = game;
        this.path = path;
        this.type = type || 'unit_basic';
        this.currentPointIndex = 0;

        // Start at the first point
        if (this.path.length > 0) {
            this.x = this.path[0].x;
            this.y = this.path[0].y;
        } else {
            this.x = 0;
            this.y = 0;
        }

        this.speed = (this.type === 'unit_tank') ? 60 : 100;
        this.radius = (this.type === 'unit_tank') ? 20 : 15;
        this.active = true;
        this.health = (this.type === 'unit_tank') ? 300 : 100;
        this.maxHealth = this.health;

        // Combat
        this.range = 150;
        this.cooldown = 0;
        this.maxCooldown = 1200;

        // Visuals
        this.color = '#4da6ff';
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.active = false;
        }
    }

    update(deltaTime) {
        if (!this.active) return;

        // Combat Cooldown
        if (this.cooldown > 0) this.cooldown -= deltaTime;

        // Try to shoot nearby towers
        if (this.cooldown <= 0) {
            let target = null;
            let minDist = Infinity;

            this.game.towers.forEach(tower => {
                if (!tower.active) return;
                const dist = Math.sqrt((tower.x - this.x) ** 2 + (tower.y - this.y) ** 2);
                if (dist < this.range && dist < minDist) {
                    minDist = dist;
                    target = tower;
                }
            });

            if (target) {
                // Shoot!
                this.game.projectiles.push(new Projectile(this.game, this.x, this.y, target, 'bullet'));
                this.cooldown = this.maxCooldown;
            }
        }

        // Movement (Only move if path exists)
        if (this.path.length === 0) return;

        // Target next waypoint
        let target = this.path[this.currentPointIndex + 1];

        if (!target) {
            // Reached the end
            this.active = false;
            console.log("Unit reached base!");
            // TODO: Deal damage to defender base
            return;
        }

        // Move towards target
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 5) {
            // Reached waypoint, move to next
            this.currentPointIndex++;
        } else {
            // Normalize and move
            const moveX = (dx / distance) * this.speed * (deltaTime / 1000);
            const moveY = (dy / distance) * this.speed * (deltaTime / 1000);
            this.x += moveX;
            this.y += moveY;
        }
    }

    render(ctx, map) {
        if (!this.active) return;

        const screenX = map.offsetX + this.x * map.scale;
        const screenY = map.offsetY + this.y * map.scale;
        const scale = map.scale;

        // Map internal types to asset names
        const assetName = (this.type === 'unit_basic') ? 'unit_grunt' :
            (this.type === 'unit_tank') ? 'unit_tank' : 'unit_grunt';

        const sprite = map.assets[assetName];

        // Sprite Drawing
        if (sprite && sprite.complete) {
            const drawSize = (this.type === 'unit_tank' ? 80 : 60) * scale;

            // Draw full image
            ctx.drawImage(
                sprite,
                0, 0, sprite.width, sprite.height,
                screenX - drawSize / 2, screenY - drawSize / 2, drawSize, drawSize
            );

        } else {
            // Fallback Circle
            const size = this.radius * map.scale;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Health Bar
        const barWidth = 30 * map.scale;
        const barHeight = 4 * map.scale;
        const barY = screenY - (this.radius * map.scale) - 15 * map.scale;

        ctx.fillStyle = 'red';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth, barHeight);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth * (this.health / this.maxHealth), barHeight);
    }
}
