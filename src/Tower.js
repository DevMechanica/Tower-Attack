import { Projectile } from './Projectile.js';

import { AudioManager } from './AudioManager.js';

export class Tower {
    constructor(game, x, y, type) {
        this.game = game;

        // Shared video frame cache for towers to optimize performance
        if (!this.game._towerVideoCache) {
            this.game._towerVideoCache = new Map();
        }
        this.x = x;
        this.y = y;
        this.type = type; // 'tower_cannon', 'tower_mage'

        this.range = 150;
        this.cooldown = 0;
        this.maxCooldown = 600; // Faster (was 1000)

        // Visuals
        this.radius = 20;
        this.color = (type === 'tower_cannon') ? 'red' : 'purple';

        this.active = true;
        this.health = 200; // Towers can be destroyed too!
        this.maxHealth = 200;
        this.recoil = 0;
        this.disabled = false; // Can be disabled by spiders
        this.attachedSpiders = []; // Track attached spider units

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
        this.idleInterval = (type === 'tower_mage') ? 0 : 3000; // Continuous for Mage, 3s for others
        // Slower idle for Mage (e.g., 1000ms vs 500ms)
        this.idleDuration = (type === 'tower_mage') ? 1000 : 500;
        this.isIdleAnimating = false;
        this.idleFrame = 0;
        this.idleFrameTimer = 0;
        this.idleTotalFrames = (type === 'tower_mage') ? 3 : 4;
        this.idleSpeed = this.idleDuration / this.idleTotalFrames;

        // Castle Base Overrides
        if (this.type === 'base_castle') {
            this.health = 100;
            this.maxHealth = 100;
            this.radius = 40; // Bigger
            this.color = '#fff'; // White
            this.range = 0; // Does not attack
        }

        // Crystal Tower - Build Animation Logic
        if (this.type === 'tower_crystal') {
            this.isBuilding = true;
            this.range = 250; // High range
            this.color = '#7dd3fc'; // Light Blue

            // Clone video so it plays independently per tower
            const buildVideoAsset = this.game.map.assets['tower_crystal_build'];
            if (buildVideoAsset) {
                this.buildVideo = buildVideoAsset.cloneNode(true);
                this.buildVideo.loop = false;
                this.buildVideo.muted = true;
                this.buildVideo.playbackRate = 1.0;
                this.buildVideo.currentTime = 0.5; // Start at 0.3 seconds

                // Load the video first
                this.buildVideo.load();

                // Play with promise handling
                this.buildVideo.play().catch(e => {
                    console.warn('Crystal Tower video autoplay blocked:', e);
                });

                this.buildVideo.addEventListener('ended', () => {
                    this.isBuilding = false;
                    this.buildVideo = null; // Cleanup
                });
            } else {
                console.warn("Crystal Tower build video not found!");
                this.isBuilding = false; // Fallback
            }
        }
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
                    target.takeDamage(40); // Increased from 20

                    // Simple Chain (find 1 neighbor)
                    const range = 200;
                    const neighbor = this.game.units.find(u =>
                        u !== target && u.active &&
                        Math.hypot(u.x - target.x, u.y - target.y) < range
                    );
                    if (neighbor) {
                        this.game.effects.spawnLightning(target.x, target.y, neighbor.x, neighbor.y);
                        neighbor.takeDamage(20); // Increased from 10
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

        // Skip targeting and shooting if disabled by spider
        if (!this.disabled) {
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
            this.game.audio.playShootTesla();
            return;
        }

        if (this.type === 'tower_mage') {
            // Trigger animation
            this.isAttacking = true;
            this.currentFrame = 0;
            this.animTimer = 0;
            this.hasFired = false;
            this.currentTarget = target;
            this.game.audio.playShootMage();
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
        if (this.type === 'base_castle') assetName = null;

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
        // Ice Towers (3 types, no animations)
        if (this.type === 'tower_pulse_cannon') assetName = 'tower_pulse_cannon';
        if (this.type === 'tower_barracks') assetName = 'tower_barracks';
        if (this.type === 'tower_pulse_cannon') assetName = 'tower_pulse_cannon';
        if (this.type === 'tower_barracks') assetName = 'tower_barracks';
        if (this.type === 'tower_ice') assetName = 'tower_ice';
        if (this.type === 'tower_crystal') assetName = 'tower_crystal';

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
        } else if (this.isAttacking && this.type === 'tower_ice' && Array.isArray(sprite)) {
            sprite = sprite[this.currentFrame];
        }

        // CRYSTAL TOWER - SPECIAL HANDLING (Must come before general sprite rendering)
        if (this.type === 'tower_crystal' && this.isBuilding && this.buildVideo) {
            // Crystal Tower Video - Building Animation with Chroma Key
            // Only process if video is ready
            if (this.buildVideo.readyState >= 2 && this.buildVideo.videoWidth > 0) {
                const size = 200 * scale;

                // Crop black bars like soldier animations
                const cropPercent = 0.50; // Use center 50% of video width
                const sourceX = this.buildVideo.videoWidth * (1 - cropPercent) / 2;
                const sourceWidth = this.buildVideo.videoWidth * cropPercent;
                const sourceY = 0;
                const sourceHeight = this.buildVideo.videoHeight;

                const aspectRatio = sourceWidth / sourceHeight;
                const drawWidth = size * aspectRatio;
                const drawHeight = size;
                const yOffset = 50 * scale;

                // Create temp canvas for processing if not exists
                if (!this._tempCanvas) {
                    this._tempCanvas = document.createElement('canvas');
                }
                this._tempCanvas.width = sourceWidth;
                this._tempCanvas.height = sourceHeight;
                const tempCtx = this._tempCanvas.getContext('2d', { willReadFrequently: true });

                // Draw cropped video to temp canvas
                tempCtx.drawImage(this.buildVideo, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

                // Process Pixel Data (Chroma Key - White & Black Background Removal)
                const imageData = tempCtx.getImageData(0, 0, this._tempCanvas.width, this._tempCanvas.height);
                const data = imageData.data;

                const bgThreshold = 245; // White threshold
                const shadowThreshold = 180;
                const saturationThreshold = 30;
                const blackThreshold = 50; // Black threshold (increased for better removal)

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const maxVal = Math.max(r, g, b);
                    const minVal = Math.min(r, g, b);
                    const range = maxVal - minVal;

                    // Remove pure black (check first, regardless of saturation)
                    if (maxVal < blackThreshold) {
                        data[i + 3] = 0; // Black -> transparent
                    }
                    // Remove white/grey background (low saturation)
                    else if (range < saturationThreshold) {
                        if (maxVal > bgThreshold) {
                            data[i + 3] = 0; // White -> transparent
                        } else if (maxVal > shadowThreshold) {
                            data[i] = 0;
                            data[i + 1] = 0;
                            data[i + 2] = 0;
                            data[i + 3] = 120; // Grey -> semi-transparent shadow
                        }
                    }
                }
                tempCtx.putImageData(imageData, 0, 0);

                // Draw Processed Canvas
                ctx.drawImage(
                    this._tempCanvas,
                    screenX - drawWidth / 2,
                    screenY - drawHeight / 2 - yOffset,
                    drawWidth,
                    drawHeight
                );
            }
        } else if (this.type === 'tower_crystal' && !this.isBuilding) {
            // Crystal Tower Static Image with Chroma Key
            const size = 200 * scale;
            const cacheKey = `processed_${assetName}`;

            // Check if we have a processed version in Game Cache (stored as canvas)
            if (!this.game._towerImageCache) {
                this.game._towerImageCache = {};
            }

            if (!this.game._towerImageCache[cacheKey] && sprite && sprite.complete) {
                // Process and Cache as Canvas (not Image)
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = sprite.width;
                tempCanvas.height = sprite.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(sprite, 0, 0);
                const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const data = imgData.data;

                const bgThreshold = 245;
                const shadowThreshold = 180;
                const saturationThreshold = 30;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const maxVal = Math.max(r, g, b);
                    const minVal = Math.min(r, g, b);
                    const range = maxVal - minVal;

                    if (range < saturationThreshold) {
                        if (maxVal > bgThreshold) data[i + 3] = 0;
                        else if (maxVal > shadowThreshold) {
                            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 120;
                        }
                    }
                }
                tempCtx.putImageData(imgData, 0, 0);

                // Cache the canvas directly (not converting to Image)
                this.game._towerImageCache[cacheKey] = tempCanvas;
            }

            const processedCanvas = this.game._towerImageCache[cacheKey];

            if (processedCanvas) {
                // Calculate size maintaining aspect ratio
                const aspectRatio = processedCanvas.width / processedCanvas.height;
                let drawWidth, drawHeight;

                if (aspectRatio > 1) {
                    drawWidth = size;
                    drawHeight = size / aspectRatio;
                } else {
                    drawHeight = size;
                    drawWidth = size * aspectRatio;
                }

                const yOffset = 50;

                ctx.drawImage(
                    processedCanvas,
                    0, 0, processedCanvas.width, processedCanvas.height,
                    screenX - drawWidth / 2, screenY - drawHeight / 2 - (yOffset * scale), drawWidth, drawHeight
                );
            }
        } else if (sprite && sprite.complete) {
            // Calculate size maintaining aspect ratio
            const baseSize = 200 * scale;
            const scaledSize = baseSize * (1 + this.recoil);

            // Maintain aspect ratio
            const aspectRatio = sprite.width / sprite.height;
            let drawWidth, drawHeight;

            if (aspectRatio > 1) {
                // Width is larger - fit to width
                drawWidth = scaledSize;
                drawHeight = scaledSize / aspectRatio;
            } else {
                // Height is larger or square - fit to height
                drawHeight = scaledSize;
                drawWidth = scaledSize * aspectRatio;
            }

            // Apply Visual Offset
            let yOffset = 50; // Default for Mage/Tesla
            if (this.type === 'tower_cannon') {
                yOffset = 15;
            }

            // Draw drop shadow at the base of where the tower visually sits
            const shadowY = screenY + drawHeight / 2 - (yOffset * scale); // At the bottom of the visible tower
            const shadowWidth = 70 * scale; // Wider shadow for towers
            const shadowHeight = 25 * scale; // Shadow height (ellipse)

            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Darker shadow for visibility
            ctx.beginPath();
            ctx.ellipse(
                screenX,
                shadowY,
                shadowWidth / 2,
                shadowHeight / 2,
                0, 0, Math.PI * 2
            );
            ctx.fill();
            ctx.restore();

            ctx.drawImage(
                sprite,
                0, 0, sprite.width, sprite.height,
                screenX - drawWidth / 2, screenY - drawHeight / 2 - (yOffset * scale), drawWidth, drawHeight
            );
        } else if (this.type === 'base_castle') {
            // Invisible Base (Art is in background)
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
            const barWidth = 45 * scale;
            const barHeight = 6 * scale;
            const barY = screenY - (45 * scale); // Above tower

            // Border
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5 * scale;
            ctx.strokeRect(screenX - barWidth / 2 - 1, barY - 1, barWidth + 2, barHeight + 2);

            // Background
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(screenX - barWidth / 2, barY, barWidth, barHeight);

            // Health fill with gradient
            const healthPercent = this.health / this.maxHealth;
            const fillWidth = barWidth * healthPercent;

            // Create gradient based on health
            const gradient = ctx.createLinearGradient(screenX - barWidth / 2, barY, screenX - barWidth / 2 + fillWidth, barY);
            if (healthPercent > 0.6) {
                gradient.addColorStop(0, '#22d3ee'); // Cyan
                gradient.addColorStop(1, '#0891b2');
            } else if (healthPercent > 0.3) {
                gradient.addColorStop(0, '#fb923c'); // Orange
                gradient.addColorStop(1, '#ea580c');
            } else {
                gradient.addColorStop(0, '#ff6b6b'); // Bright red
                gradient.addColorStop(1, '#dc2626');
            }

            ctx.fillStyle = gradient;
            ctx.fillRect(screenX - barWidth / 2, barY, fillWidth, barHeight);
        }
    }

    serialize() {
        return {
            type: this.type,
            x: this.x,
            y: this.y,
            health: this.health,
            cooldown: this.cooldown,
            isAttacking: this.isAttacking,
            active: this.active
        };
    }
}

export const TowerCosts = {
    'tower_cannon': 50,
    'tower_mage': 100,
    'tower_tesla': 150,
    'tower_pulse_cannon': 60,
    'tower_barracks': 90,
    'tower_pulse_cannon': 60,
    'tower_barracks': 90,
    'tower_ice': 120,
    'tower_crystal': 200
};
