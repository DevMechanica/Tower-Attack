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
            this.attackVideo = null; // Will hold the attack animation video when attacking
            this.maxCooldown = 4000; // Crystal tower attack speed (matches 4 second animation)

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

        if (this.type === 'tower_crystal' && !this.isBuilding) {
            // Don't start a new attack if one is already playing
            if (this.attackVideo) {
                return;
            }

            // Store target's path position NOW (before it might die)
            // Always find closest path point to target's actual position (more reliable)
            if (target) {
                this._burnTargetTeam = target.team; // Capturing Team for Direction Logic
                const path = this.game.map.path;
                let closestIndex = 0;
                let closestDist = Infinity;
                for (let i = 0; i < path.length; i++) {
                    const dx = path[i].x - target.x;
                    const dy = path[i].y - target.y;
                    const dist = dx * dx + dy * dy;
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestIndex = i;
                    }
                }
                this._burnTargetIndex = closestIndex;
                console.log('Crystal: target type:', target.type, 'team:', target.team, 'at position:', Math.round(target.x), Math.round(target.y), '-> closest path index:', closestIndex);
            } else {
                this._burnTargetIndex = null;
                this._burnTargetTeam = 'attacker'; // Default fallback
                console.log('Crystal: no target, using fallback');
            }

            // Trigger attack animation video
            const attackVideoAsset = this.game.map.assets['tower_crystal_attack'];
            if (attackVideoAsset) {
                this.attackVideo = attackVideoAsset.cloneNode(true);
                this.attackVideo.loop = false;
                this.attackVideo.muted = true;
                this.attackVideo.playbackRate = 1.0;
                this.attackVideo.currentTime = 0;

                this.attackVideo.load();

                this.attackVideo.play().catch(e => {
                    console.warn('Crystal Tower attack video play blocked:', e);
                });

                // Handle attack at mid-point of animation
                this.attackVideo.addEventListener('timeupdate', () => {
                    // Fire projectile at around 40% of the animation
                    if (this.attackVideo && this.attackVideo.currentTime >= this.attackVideo.duration * 0.4 && !this.hasFired) {
                        if (target && target.active) {
                            const projType = 'magic';
                            this.game.projectiles.push(new Projectile(this.game, this.x, this.y, target, projType));
                            this.recoil = 0.2;
                        }
                        this.hasFired = true;
                    }
                });

                this.attackVideo.addEventListener('ended', () => {
                    this.attackVideo = null; // Cleanup
                    this.hasFired = false;
                    this._burnTargetIndex = null; // Reset for next attack
                    this._burnTargetTeam = null;
                });
            }
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
        } else if (this.type === 'tower_crystal' && this.attackVideo && this.attackVideo.readyState >= 2) {
            // Crystal Tower Attack Animation
            const size = 200 * scale;

            // Use full video dimensions (no cropping needed for this animation)
            const sourceX = 0;
            const sourceWidth = this.attackVideo.videoWidth;
            const sourceY = 0;
            const sourceHeight = this.attackVideo.videoHeight;

            // Match size to static tower - use size as the height (tower is taller than wide)
            const aspectRatio = sourceWidth / sourceHeight;
            const drawHeight = size;
            const drawWidth = size * aspectRatio;
            const yOffset = 50 * scale;

            // Create temp canvas for processing if not exists
            if (!this._attackTempCanvas) {
                this._attackTempCanvas = document.createElement('canvas');
            }
            this._attackTempCanvas.width = sourceWidth;
            this._attackTempCanvas.height = sourceHeight;
            const tempCtx = this._attackTempCanvas.getContext('2d', { willReadFrequently: true });

            // Draw full video to temp canvas
            tempCtx.drawImage(this.attackVideo, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

            // Process Pixel Data (Chroma Key - White & Black Background Removal)
            const imageData = tempCtx.getImageData(0, 0, this._attackTempCanvas.width, this._attackTempCanvas.height);
            const data = imageData.data;

            const bgThreshold = 245;
            const shadowThreshold = 180;
            const saturationThreshold = 30;
            const blackThreshold = 50;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const maxVal = Math.max(r, g, b);
                const minVal = Math.min(r, g, b);
                const range = maxVal - minVal;

                if (maxVal < blackThreshold) {
                    data[i + 3] = 0;
                }
                else if (range < saturationThreshold) {
                    if (maxVal > bgThreshold) {
                        data[i + 3] = 0;
                    } else if (maxVal > shadowThreshold) {
                        data[i] = 0;
                        data[i + 1] = 0;
                        data[i + 2] = 0;
                        data[i + 3] = 120;
                    }
                }
            }
            tempCtx.putImageData(imageData, 0, 0);

            // Split rendering: tower part at normal size, lightning beam stretched to top of screen
            // The lightning beam is only the very tip top portion of the video
            const lightningCutoff = 0.03; // Top 3% of video is lightning beam only

            // Calculate source regions
            const towerSourceHeight = sourceHeight * (1 - lightningCutoff);
            const lightningSourceHeight = sourceHeight * lightningCutoff;

            // Calculate draw regions - tower stays normal size
            const towerDrawHeight = drawHeight * (1 - lightningCutoff);

            // Position the tower
            const towerDrawY = screenY - drawHeight / 2 - yOffset + (drawHeight * lightningCutoff);

            // Lightning extends all the way to top of screen
            const lightningDrawY = 0;
            const lightningDrawHeight = towerDrawY; // From top of screen to top of tower

            // Draw the tower portion (bottom part of video) - normal size
            ctx.drawImage(
                this._attackTempCanvas,
                0, sourceHeight * lightningCutoff, // Source: start after lightning portion
                sourceWidth, towerSourceHeight,    // Source: tower height
                screenX - drawWidth / 2,
                towerDrawY,
                drawWidth,
                towerDrawHeight
            );

            // Draw the lightning beam stretched to top of screen (entire animation)
            ctx.drawImage(
                this._attackTempCanvas,
                0, 0,                              // Source: top of video (beam only)
                sourceWidth, lightningSourceHeight, // Source: lightning height
                screenX - drawWidth / 2,
                lightningDrawY,
                drawWidth,
                lightningDrawHeight
            );

            // Falling lightning effect after 2 seconds - burns path around targeted soldier
            if (this.attackVideo.currentTime >= 2.0) {
                const fallDuration = this.attackVideo.duration - 2.0;
                const fallProgress = Math.min(1, (this.attackVideo.currentTime - 2.0) / fallDuration);

                // Get path points from the map
                const path = this.game.map.path;

                // Use target position captured when attack started
                // Debug: log what we have
                if (!this._loggedBurn) {
                    console.log('Crystal burn target index:', this._burnTargetIndex, 'path length:', path.length);
                    this._loggedBurn = true;
                }
                const targetPathIndex = (this._burnTargetIndex !== null && this._burnTargetIndex !== undefined)
                    ? this._burnTargetIndex
                    : Math.floor(path.length * 0.7); // Default to 70% along path (near castle)

                // Burn starts AHEAD of soldier to account for 2s delay + lead time
                // User requested 3.
                let burnAheadOffset = 3;

                // FLIP FOR DEFENDER (Red Team moves End -> Start, so "Ahead" is negative)
                if (this._burnTargetTeam === 'defender') {
                    burnAheadOffset = -3;
                }

                const burnLength = 6; // Total waypoints to burn

                // Start point is ahead of target (higher index = further along path toward castle)
                const burnStartIndex = Math.max(0, Math.min(targetPathIndex + burnAheadOffset, path.length - 1));

                // End point is behind where we started (relative to movement direction)
                let burnEndIndex;
                if (this._burnTargetTeam === 'defender') {
                    // Defender moves End->Start. Lightning starts "Ahead" (lower index) and burns "Back" (higher index)
                    burnEndIndex = Math.min(burnStartIndex + burnLength, path.length - 1);
                } else {
                    // Attacker moves Start->End. Lightning starts "Ahead" (higher index) and burns "Back" (lower index)
                    burnEndIndex = Math.max(0, burnStartIndex - burnLength);
                }

                // Calculate range
                const burnRange = burnEndIndex - burnStartIndex;

                // Calculate exact floating point position
                const currentFloatIndex = burnStartIndex + (fallProgress * burnRange);

                // Determine segment indices based on direction
                let segmentIndexA, segmentIndexB;
                let segmentProgress; // 0..1 along the segment A->B

                if (burnRange >= 0) {
                    // Forward Direction (e.g. 0 -> 6)
                    // At 1.2: Segment 1->2. Progress 0.2
                    segmentIndexA = Math.floor(currentFloatIndex);
                    segmentIndexB = segmentIndexA + 1;
                    segmentProgress = currentFloatIndex - segmentIndexA;
                } else {
                    // Backward Direction (e.g. 10 -> 4)
                    // At 9.4: Segment 10->9. Progress 0.6 (10 - 9.4)
                    segmentIndexA = Math.ceil(currentFloatIndex);
                    segmentIndexB = segmentIndexA - 1;
                    segmentProgress = segmentIndexA - currentFloatIndex;
                }

                // Clamp indices safely
                const safeP1Index = Math.max(0, Math.min(segmentIndexA, path.length - 1));
                const safeP2Index = Math.max(0, Math.min(segmentIndexB, path.length - 1));

                // Interpolate Position
                const p1 = path[safeP1Index];
                const p2 = path[safeP2Index];

                const currentX = map.offsetX + (p1.x + (p2.x - p1.x) * segmentProgress) * map.scale;
                const currentY = map.offsetY + (p1.y + (p2.y - p1.y) * segmentProgress) * map.scale;

                ctx.save();

                // Lightning bolt dimensions
                const beamWidth = 25 * scale;
                const beamLength = 150 * scale;

                // Draw falling lightning bolt at current interpolated position
                ctx.drawImage(
                    this._attackTempCanvas,
                    0, 0,
                    sourceWidth, lightningSourceHeight,
                    currentX - beamWidth,
                    currentY - beamLength,
                    beamWidth * 2,
                    beamLength
                );

                // Add glow around lightning bolt
                const glowGradient = ctx.createRadialGradient(currentX, currentY, 0, currentX, currentY, 60 * scale);
                glowGradient.addColorStop(0, 'rgba(200, 240, 255, 0.6)');
                glowGradient.addColorStop(0.3, 'rgba(125, 211, 252, 0.4)');
                glowGradient.addColorStop(1, 'rgba(125, 211, 252, 0)');
                ctx.fillStyle = glowGradient;
                ctx.beginPath();
                ctx.arc(currentX, currentY, 60 * scale, 0, Math.PI * 2);
                ctx.fill();

                // Burning fire trail - directional
                ctx.globalCompositeOperation = 'lighter';

                // Draw up to the current SEGMENT start (segmentIndexA)
                // If Forward (0->6), A=1. Draw 0, 1.
                // If Backward (10->4), A=10. Draw 10. (Next frame 9.4, A=10. Wait, should we draw 10? Yes path is scorching from start)

                const steps = Math.abs(segmentIndexA - burnStartIndex);
                for (let k = 0; k <= steps; k++) {
                    const i = burnStartIndex + (burnRange >= 0 ? k : -k);

                    if (path[i]) {
                        const px = map.offsetX + path[i].x * map.scale;
                        const py = map.offsetY + path[i].y * map.scale;

                        // Age based on distance from current LEADING EDGE (currentFloatIndex)
                        const dist = Math.abs(currentFloatIndex - i);
                        const fireAge = Math.min(1, dist / Math.abs(burnRange));
                        const fireSize = 30 * scale * (1 - fireAge * 0.3);

                        const fireGradient = ctx.createRadialGradient(px, py, 0, px, py, fireSize);
                        fireGradient.addColorStop(0, `rgba(255, 220, 120, ${0.9 - fireAge * 0.4})`);
                        fireGradient.addColorStop(0.4, `rgba(255, 150, 50, ${0.7 - fireAge * 0.4})`);
                        fireGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
                        ctx.fillStyle = fireGradient;
                        ctx.beginPath();
                        ctx.arc(px, py, fireSize, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // DRAW LEADING FIRE CIRCLE AT EXACT LIGHTNING POSITION (Smoothing)
                {
                    const fireSize = 30 * scale; // Full size (fresh)
                    const fireGradient = ctx.createRadialGradient(currentX, currentY, 0, currentX, currentY, fireSize);
                    fireGradient.addColorStop(0, 'rgba(255, 220, 120, 0.9)');
                    fireGradient.addColorStop(0.4, 'rgba(255, 150, 50, 0.7)');
                    fireGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
                    ctx.fillStyle = fireGradient;
                    ctx.beginPath();
                    ctx.arc(currentX, currentY, fireSize, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Electric sparks at current position
                ctx.strokeStyle = 'rgba(200, 240, 255, 0.9)';
                ctx.lineWidth = 2 * scale;
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2 + fallProgress * 10;
                    const sparkLength = (15 + Math.random() * 20) * scale;
                    ctx.beginPath();
                    ctx.moveTo(currentX, currentY);
                    ctx.lineTo(
                        currentX + Math.cos(angle) * sparkLength,
                        currentY + Math.sin(angle) * sparkLength
                    );
                    ctx.stroke();
                }

                ctx.restore();
            }
            // Note: _burnTargetIndex is reset in the 'ended' event listener, not here
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
