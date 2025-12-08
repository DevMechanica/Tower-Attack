import { Projectile } from './Projectile.js';

export class Unit {
    constructor(game, path) {
        this.game = game;
        this.path = path;
        this.currentPointIndex = 0;

        // Start at the first point
        if (this.path.length > 0) {
            this.x = this.path[0].x;
            this.y = this.path[0].y;
        } else {
            this.x = 0;
            this.y = 0;
        }

        this.speed = 100; // Pixels per second (game coordinates)
        this.radius = 15;
        this.active = true;
        this.health = 100;
        this.maxHealth = 100;

        // Visuals (Placeholder for sprite mapping)
        // We will just draw a circle or a simple sprite crop for now
        this.color = '#4da6ff'; // Blue attacker
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

        // Convert game coordinates to screen coordinates
        const screenX = map.offsetX + this.x * map.scale;
        const screenY = map.offsetY + this.y * map.scale;
        const size = this.radius * map.scale;

        // Draw Unit (Placeholder Circle)
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Health Bar
        const barWidth = 30 * map.scale;
        const barHeight = 4 * map.scale;
        ctx.fillStyle = 'red';
        ctx.fillRect(screenX - barWidth / 2, screenY - size - 10 * map.scale, barWidth, barHeight);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(screenX - barWidth / 2, screenY - size - 10 * map.scale, barWidth * (this.health / this.maxHealth), barHeight);
    }
}
