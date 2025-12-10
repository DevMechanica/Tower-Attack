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
        this.recoil = 0;

        // Animation State
        this.isAttacking = false;
        this.currentFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 0.05; // 50ms per frame approx (assuming dt is seconds) - wait, update(deltaTime) usually in ms or seconds?
        // Let's check update loop. Typically games pass ms or seconds.
        // Tower.js:38 this.cooldown -= deltaTime; and maxCooldown = 1000. So deltaTime is ms.
        this.animSpeed = 150; // 200ms per frame (slower)
        this.totalFrames = 4;
        this.hasFired = false;
        this.currentTarget = null;

        // Idle Animation State
        this.idleTimer = 0;
        this.idleInterval = 3000; // Trigger every 3 seconds
        // Slower idle for Mage (e.g., 1000ms vs 500ms)
        this.idleDuration = (type === 'tower_mage') ? 1000 : 500;
        this.isIdleAnimating = false;
        this.idleFrame = 0;
        this.idleFrameTimer = 0;
        this.idleTotalFrames = (type === 'tower_mage') ? 3 : 4;
        this.idleSpeed = this.idleDuration / this.idleTotalFrames;
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

        // Animation update
        if (this.isAttacking) {
            this.animTimer += deltaTime;
            if (this.animTimer >= this.animSpeed) {
                this.animTimer = 0;
                this.currentFrame++;
                if (this.currentFrame >= this.totalFrames) {
                    this.isAttacking = false;
                    this.currentFrame = 0;
                    this.hasFired = false;
                    this.currentTarget = null;
                }
            }

            // Sync attack with last frame (frame 4, since 0-indexed and totalFrames is 5)
            if (this.isAttacking && this.currentFrame === this.totalFrames - 1 && !this.hasFired) {
                if (this.currentTarget && this.currentTarget.active) {
                    // Execute Attack
                    const target = this.currentTarget;

                    // Instant Hit + Chain Lightning
                    this.game.effects.spawnLightning(this.x, this.y - 40, target.x, target.y);
                    target.takeDamage(20);

                    // Simple Chain (find 1 neighbor)
                    const range = 200;
                    const neighbor = this.game.units.find(u =>
                        u !== target && u.active &&
                        Math.hypot(u.x - target.x, u.y - target.y) < range
                    );
                    if (neighbor) {
                        this.game.effects.spawnLightning(target.x, target.y, neighbor.x, neighbor.y);
                        neighbor.takeDamage(10);
                    }
                }
                this.hasFired = true;
            }
        }

        // Initialize animation for mage tower too
        if (this.isAttacking && this.type === 'tower_mage') {
            this.animTimer += deltaTime;
            if (this.animTimer >= this.animSpeed) {
                this.animTimer = 0;
                this.currentFrame++;
                if (this.currentFrame >= 3) { // Mage has 3 frames
                    this.isAttacking = false;
                    this.currentFrame = 0;
                    this.hasFired = false;
                    this.currentTarget = null;
                }
            }

            // Sync Attack (Projectiles) for Mage - Frame 2 (last frame, 0-indexed)
            if (this.isAttacking && this.currentFrame === 2 && !this.hasFired) {
                if (this.currentTarget && this.currentTarget.active) {
                    const target = this.currentTarget;
                    const projType = 'magic';
                    this.game.projectiles.push(new Projectile(this.game, this.x, this.y, target, projType));
                    this.recoil = 0.2;
                }
                this.hasFired = true;
            }
        }

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

        // Idle Animation Update (Only if not attacking)
        if (!this.isAttacking && (this.type === 'tower_tesla' || this.type === 'tower_mage')) {
            this.idleTimer += deltaTime;
            if (this.idleTimer >= this.idleInterval && this.idleTimer < this.idleInterval + this.idleDuration) {
                if (!this.isIdleAnimating) {
                    this.isIdleAnimating = true;
                    this.idleFrame = 0;
                    this.idleFrameTimer = 0;
                }

                // Advance Idle Frames
                this.idleFrameTimer += deltaTime;
                if (this.idleFrameTimer >= this.idleSpeed) {
                    this.idleFrameTimer = 0;
                    this.idleFrame++;
                    if (this.idleFrame >= this.idleTotalFrames) {
                        this.idleFrame = 0; // Loop or just clamp? logic below resets it anyway
                    }
                }
            } else if (this.idleTimer >= this.idleInterval + this.idleDuration) {
                this.isIdleAnimating = false;
                this.idleTimer = 0;
                this.idleFrame = 0;
            } else {
                this.isIdleAnimating = false;
            }
        } else {
            // Reset idle if we interrupt with attack? Or just pause?
            // Resetting feels cleaner so it doesn't pop up immediately after attack
            this.isIdleAnimating = false;
            this.idleTimer = 0;
        }
    }

    shoot(target) {
        if (this.type === 'tower_tesla') {
            // Trigger animation
            this.isAttacking = true;
            this.currentFrame = 0;
            this.animTimer = 0;
            this.hasFired = false;
            this.currentTarget = target;

            // Damage is now handled in update() on the last frame

            this.recoil = 0.2;
            return;
        }

        if (this.type === 'tower_mage') {
            // Trigger animation
            this.isAttacking = true;
            this.currentFrame = 0;
            this.animTimer = 0;
            this.hasFired = false;
            this.currentTarget = target;
            // Projectile spawn is now deferred to update()
            return;
        }

        // Create projectile (Cannon only now, or others)
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
        let assetName = 'Main_tower';
        if (this.type === 'tower_mage') {
            if (this.isAttacking) {
                assetName = 'tower_mage_anim';
            } else if (this.isIdleAnimating) {
                assetName = 'tower_mage_idle';
            } else {
                assetName = 'tower_mage';
            }
        }
        if (this.type === 'tower_tesla') {
            if (this.isAttacking) {
                assetName = 'tower_tesla_anim';
            } else if (this.isIdleAnimating) {
                assetName = 'tower_tesla_idle';
            } else {
                assetName = 'tower_tesla';
            }
        }

        // if (this.recoil > 0 && this.type === 'tower_cannon') {
        //    assetName = 'Main_tower_attack';
        // }

        let sprite = map.assets[assetName];
        if (this.isAttacking && this.type === 'tower_tesla' && Array.isArray(sprite)) {
            sprite = sprite[this.currentFrame];
        } else if (this.isIdleAnimating && this.type === 'tower_tesla' && Array.isArray(sprite)) {
            sprite = sprite[this.idleFrame];
        } else if (this.isAttacking && this.type === 'tower_mage' && Array.isArray(sprite)) {
            sprite = sprite[this.currentFrame];
        } else if (this.isIdleAnimating && this.type === 'tower_mage' && Array.isArray(sprite)) {
            sprite = sprite[this.idleFrame];
        }

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
