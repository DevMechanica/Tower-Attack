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

        // Animation
        this.animState = 'walk'; // 'walk' or 'attack'
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 0.1; // Seconds per frame
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
                this.attackAnim = 0.3; // Attack animation timer (seconds)
                this.tx = target.x; // Target snapshot for lunge
                this.ty = target.y;
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

        // Update Animation Frame
        this.animTimer += 1 / 60; // Assuming ~60fps, or pass deltaTime to render if available? 
        // Actually render usually doesn't take deltaTime in this engine structure often, 
        // but let's check if we can use a fixed step or if we should rely on update() for timer.
        // For visual smoothness, best to update visuals in render or update. 
        // Let's use a simple incrementer here since we don't have dt in render signature easily without changing call site.
        // Wait, Map.js update calls render(ctx). Game.js calls render(ctx).
        // Let's just use a small constant for now or use the fact that this is called every frame.

        if (this.animTimer >= this.animSpeed) {
            this.animTimer = 0;
            this.animFrame++;
        }

        let renderX = this.x;
        let renderY = this.y;

        // Procedural Attack Lunge (keep or remove? user wants animation now)
        // If we have an attack animation, we might not need the lunge as much, 
        // but let's keep it subtle or disable it if it conflicts. 
        // The user identified animations for shooting.

        // Determine State
        // If attackAnim > 0 (from update logic), we are attacking
        if (this.attackAnim > 0) {
            if (this.animState !== 'attack') {
                this.animState = 'attack';
                this.animFrame = 0;
            }
        } else {
            if (this.animState !== 'walk') {
                this.animState = 'walk';
                this.animFrame = 0;
            }
        }

        const screenX = map.offsetX + renderX * map.scale;
        const screenY = map.offsetY + renderY * map.scale;
        const scale = map.scale;

        // Select Asset
        let assetName;
        let isSequence = false;

        if (this.type === 'unit_basic') {
            if (this.animState === 'attack') {
                assetName = 'soldier_attack';
                isSequence = true;
            } else {
                assetName = 'soldier_walk';
                isSequence = true;
            }
        } else if (this.type === 'unit_tank') {
            assetName = 'unit_tank';
        } else {
            assetName = 'Main_unit';
        }

        let sprite;
        if (isSequence) {
            const frames = map.assets[assetName];
            if (frames && frames.length > 0) {
                // Loop
                const frameIdx = this.animFrame % frames.length;
                sprite = frames[frameIdx];
            }
        } else {
            sprite = map.assets[assetName];
        }

        // Sprite Drawing
        if (sprite && sprite.complete) {
            const drawSize = (this.type === 'unit_tank' ? 80 : 60) * scale;

            // Flip logic if moving left?
            // Since we only have one direction images, we might need to flip canvas if dx < 0.
            // But for now let's just draw.

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
