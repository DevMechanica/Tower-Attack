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

        // Stats
        this.speed = 100;
        this.health = 100;
        this.maxHealth = 100;
        this.radius = 15;

        if (this.type === 'unit_tank') {
            this.health = 300;
            this.maxHealth = 300;
            this.speed = 60;
            this.radius = 20;
        } else if (this.type === 'unit_golem') {
            this.health = 800; // Tanky
            this.maxHealth = 800;
            this.speed = 40; // Slow
            this.radius = 25;
        }

        this.active = true;

        // Combat
        this.range = 150;
        this.cooldown = 0;
        this.maxCooldown = 1200;

        // Visuals
        this.color = '#4da6ff';

        // Animation
        this.animState = 'walk';
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 0.1;
        this.attackAnim = 0;
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.active = false;
            // Visuals
            this.game.effects.spawnExplosion(this.x, this.y);
            // Grant Gold
            this.game.attackerGold += (this.type === 'unit_golem' ? 50 : 10);
        }
    }

    update(deltaTime) {
        if (!this.active) return;

        // Combat Cooldown
        if (this.cooldown > 0) this.cooldown -= deltaTime;

        // Attack Animation Timer
        if (this.attackAnim > 0) {
            this.attackAnim -= deltaTime / 1000;
            if (this.attackAnim < 0) this.attackAnim = 0;
        }

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
                this.attackAnim = 0.3;
            }
        }

        // Movement (Only move if path exists)
        if (this.path.length === 0) return;

        // Target next waypoint
        let target = this.path[this.currentPointIndex + 1];

        if (!target) {
            // Reached the end
            this.active = false;
            // Damage defender
            this.game.defenderLives -= 1;
            return;
        }

        // Move towards target
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 5) {
            this.currentPointIndex++;
        } else {
            const moveX = (dx / distance) * this.speed * (deltaTime / 1000);
            const moveY = (dy / distance) * this.speed * (deltaTime / 1000);
            this.x += moveX;
            this.y += moveY;
        }
    }

    render(ctx, map) {
        if (!this.active) return;

        this.animTimer += 1 / 60;
        if (this.animTimer >= this.animSpeed) {
            this.animTimer = 0;
            this.animFrame++;
        }

        let renderX = this.x;
        let renderY = this.y;

        const screenX = map.offsetX + renderX * map.scale;
        const screenY = map.offsetY + renderY * map.scale;
        const scale = map.scale;

        // Select Asset
        let assetName;
        let isSequence = false;

        if (this.type === 'unit_basic') {
            assetName = 'soldier_walk'; // Simplify to always walk for now
            isSequence = true;
        } else if (this.type === 'unit_tank') {
            assetName = 'unit_tank';
        } else if (this.type === 'unit_golem') {
            assetName = 'unit_golem';
        } else {
            assetName = 'Main_unit';
        }

        let sprite;
        if (isSequence) {
            const frames = map.assets[assetName];
            if (frames && frames.length > 0) {
                const frameIdx = this.animFrame % frames.length;
                sprite = frames[frameIdx];
            }
        } else {
            sprite = map.assets[assetName];
        }

        // Sprite Drawing
        if (sprite && sprite.complete) {
            let drawSize = 60 * scale;
            if (this.type === 'unit_tank') drawSize = 80 * scale;
            if (this.type === 'unit_golem') drawSize = 100 * scale;

            ctx.drawImage(
                sprite,
                0, 0, sprite.width, sprite.height,
                screenX - drawSize / 2, screenY - drawSize / 2 - (drawSize * 0.2), drawSize, drawSize
            );

        } else {
            // Fallback Circle
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.radius * map.scale, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Health Bar
        const barWidth = 30 * map.scale;
        const barHeight = 4 * map.scale;
        const barY = screenY - (this.radius * map.scale) - 20 * map.scale;

        ctx.fillStyle = 'red';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth, barHeight);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth * (this.health / this.maxHealth), barHeight);
    }
}
