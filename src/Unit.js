import { Projectile } from './Projectile.js';

// --- BASE CLASS ---
export class Unit {
    constructor(game, path, type) {
        this.game = game;
        this.path = path;
        this.type = type || 'unit_basic';
        this.currentPointIndex = 0;

        // Start Position
        if (this.path && this.path.length > 0) {
            this.x = this.path[0].x;
            this.y = this.path[0].y;
        } else {
            this.x = 0;
            this.y = 0;
        }

        this.state = 'MOVING'; // MOVING, ATTACKING
        this.active = true;

        // Default Stats
        this.setupStats();

        // Visuals
        this.color = '#4da6ff';
        this.animState = 'walk';
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 0.1;
        this.attackAnim = 0;
        this.direction = 'right'; // Track movement direction for directional sprites

        // Combat Cooldown
        this.cooldown = 0;
        this.maxCooldown = 1200; // ms
    }

    setupStats() {
        // Defaults
        this.speed = 110; // Increased
        this.health = 167; // Reduced -5%
        this.maxHealth = 167;
        this.radius = 15;
        this.range = 150;
        this.siegesBase = false; // Default: Kamikaze into base. Set true to stop and shoot.

        // Type Specific Overrides
        if (this.type === 'unit_tank') {
            this.health = 523; // Reduced -5%
            this.maxHealth = 523;
            this.speed = 60; // Increased
            this.radius = 20;
        } else if (this.type === 'unit_golem') {
            this.health = 1463; // Reduced -5%
            this.maxHealth = 1463;
            this.speed = 50; // Increased
            this.radius = 25;
        } else if (this.type === 'unit_mecha_dino') {
            this.health = 732; // Reduced -5%
            this.maxHealth = 732;
            this.speed = 80; // Increased
            this.radius = 30;
        } else if (this.type === 'unit_saber_rider') {
            this.health = 418; // Reduced -5%
            this.maxHealth = 418;
            this.speed = 140; // Increased
            this.radius = 20;
        } else if (this.type === 'unit_crawler') {
            this.health = 125; // Reduced -5%
            this.maxHealth = 125;
            this.speed = 130; // Increased
            this.radius = 15;
        } else if (this.type === 'unit_spider') {
            this.health = 200;
            this.maxHealth = 200;
            this.speed = 100;
            this.radius = 18;
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.active = false;
            // Visuals
            if (this.game.effects) this.game.effects.spawnExplosion(this.x, this.y);
            // No Gold Refund for Attacker Units!
        }
    }

    update(deltaTime) {
        if (!this.active) return;

        if (this.cooldown > 0) this.cooldown -= deltaTime;
        if (this.attackAnim > 0) {
            this.attackAnim -= deltaTime / 1000;
            if (this.attackAnim < 0) this.attackAnim = 0;
        }

        this.updateBehavior(deltaTime);
    }

    updateBehavior(deltaTime) {
        // Override in subclasses
    }

    // Common Move Logic using path
    moveAlongPath(deltaTime) {
        if (!this.path || this.path.length === 0) return;

        // Target next waypoint
        let waypoint = this.path[this.currentPointIndex + 1];

        if (!waypoint) {
            this.reachBase();
            return;
        }

        const dx = waypoint.x - this.x;
        const dy = waypoint.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 5) {
            this.currentPointIndex++;
        } else {
            const moveX = (dx / distance) * this.speed * (deltaTime / 1000);
            const moveY = (dy / distance) * this.speed * (deltaTime / 1000);
            this.x += moveX;
            this.y += moveY;

            // Update direction based on primary movement axis
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            if (absDx > absDy) {
                // Horizontal movement is dominant
                this.direction = dx > 0 ? 'right' : 'left';
            } else if (absDy > 1) {
                // Vertical movement is dominant
                this.direction = dy > 0 ? 'down' : 'up';
            }
        }
    }

    reachBase() {
        // Base logic: If an actual base tower exists, we should have attacked it.
        // If we "reach" it (overlap it), we can deal massive damage or self-destruct for damage.
        // For this game, let's say they self-destruct for guaranteed damage if they touch it.
        // BUT, ideally they stop at range.
        this.active = false;
        this.game.defenderLives -= 15;
        this.game.updateUI(); // Immediate Update

        // Also damage the base explicitly if it exists
        if (this.game.enemyBase && this.game.enemyBase.active) {
            this.game.enemyBase.takeDamage(15); // Fixed 15 damage per unit
        }
    }

    findTarget(ignoreRegularTowers = false) {
        let target = null;
        let minDist = Infinity;

        this.game.towers.forEach(tower => {
            if (!tower.active) return;

            // If ignoreRegularTowers is true, only target the BASE
            if (ignoreRegularTowers && tower.type !== 'base_castle') return;

            const dist = Math.sqrt((tower.x - this.x) ** 2 + (tower.y - this.y) ** 2);
            if (dist < this.range && dist < minDist) {
                minDist = dist;
                target = tower;
            }
        });
        return target;
    }

    shoot(target) {
        this.game.projectiles.push(new Projectile(this.game, this.x, this.y, target, 'bullet'));
        this.cooldown = this.maxCooldown;
        this.attackAnim = 0.3;
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
        let assetName = 'Main_unit';
        let isSequence = false;

        if (this.type === 'unit_basic' || this.type === 'unit_crawler') {
            assetName = 'soldier_walk';
            isSequence = true;
        } else if (this.type === 'unit_spider') {
            // Check if spider is attaching/attached (SpiderUnit specific state)
            if (this.state === 'ATTACHING' || this.state === 'ATTACHED') {
                assetName = 'spider_attach';
                isSequence = true;
            } else {
                // Use 4-directional animation for spider walking
                if (this.direction === 'right') {
                    assetName = 'spider_walk_right';
                } else if (this.direction === 'up') {
                    assetName = 'spider_walk_up';
                } else if (this.direction === 'down') {
                    assetName = 'spider_walk'; // Use default for down
                } else {
                    assetName = 'spider_walk'; // Default left
                }
                isSequence = true;
            }
        } else if (this.type === 'unit_tank') {
            assetName = 'unit_tank';
        } else if (this.type === 'unit_golem') {
            assetName = 'unit_golem';
        } else if (this.type === 'unit_mecha_dino') {
            assetName = 'unit_mecha_dino';
        } else if (this.type === 'unit_saber_rider') {
            assetName = 'unit_saber_rider';
        }

        // Draw Sprite
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

        if (sprite && sprite.complete) {
            let drawSize = 60 * scale;
            if (this.type === 'unit_tank') drawSize = 80 * scale;
            if (this.type === 'unit_golem') drawSize = 100 * scale;
            if (this.type === 'unit_spider') drawSize = 70 * scale;

            // Tint for crawler to distinguish? Or just use same sprite
            // if (this.type === 'unit_crawler') ctx.filter = 'hue-rotate(90deg)'; 
            // ctx.filter is expensive, maybe skip for now

            ctx.drawImage(
                sprite,
                0, 0, sprite.width, sprite.height,
                screenX - drawSize / 2, screenY - drawSize / 2 - (drawSize * 0.2), drawSize, drawSize
            );
            // ctx.filter = 'none';

        } else {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(screenX, screenY, this.radius * map.scale, 0, Math.PI * 2);
            ctx.fill();
        }

        // Health Bar
        const barWidth = 30 * map.scale;
        const barHeight = 5 * map.scale;
        const barY = screenY - (this.radius * map.scale) - 20 * map.scale;

        // Border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1 * map.scale;
        ctx.strokeRect(screenX - barWidth / 2 - 1, barY - 1, barWidth + 2, barHeight + 2);

        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth, barHeight);

        // Health fill with gradient
        const healthPercent = this.health / this.maxHealth;
        const fillWidth = barWidth * healthPercent;

        // Create gradient based on health
        const gradient = ctx.createLinearGradient(screenX - barWidth / 2, barY, screenX - barWidth / 2 + fillWidth, barY);
        if (healthPercent > 0.6) {
            gradient.addColorStop(0, '#4ade80'); // Green
            gradient.addColorStop(1, '#22c55e');
        } else if (healthPercent > 0.3) {
            gradient.addColorStop(0, '#fbbf24'); // Yellow
            gradient.addColorStop(1, '#f59e0b');
        } else {
            gradient.addColorStop(0, '#f87171'); // Red
            gradient.addColorStop(1, '#ef4444');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(screenX - barWidth / 2, barY, fillWidth, barHeight);
    }

    // Serialization for Network/Save
    serialize() {
        return {
            type: this.type,
            x: this.x,
            y: this.y,
            health: this.health,
            currentPointIndex: this.currentPointIndex,
            active: this.active
        };
    }
}


// --- SUBCLASSES ---

export class AttackerUnit extends Unit {
    // "Attacker": Ignores towers, goes for base.
    // Units: Basic Unit (Grunt), Tank
    updateBehavior(deltaTime) {
        // Attackers ignore towers.
        // If siegesBase is true, they will stop and attack the Base.
        // Otherwise, they ignore it and Kamikaze (move until reachBase).

        if (this.siegesBase) {
            let target = this.findTarget(true); // ignoreRegularTowers = true
            if (target) {
                this.state = 'ATTACKING';
                if (this.cooldown <= 0) {
                    this.shoot(target);
                }
                return;
            }
        }

        // Current Kamikaze Logic: Just keep moving until reachBase() triggers
        this.state = 'MOVING';
        this.moveAlongPath(deltaTime);
    }
}

export class SiegerUnit extends Unit {
    // "Sieger": Stops to attack towers.
    // Units: Golem, Mecha Dino
    updateBehavior(deltaTime) {
        // 1. Check for target
        let target = this.findTarget();

        if (target) {
            this.state = 'ATTACKING';
            // Stop moving, rotate to target? (no rotation logic yet)

            if (this.cooldown <= 0) {
                this.shoot(target);
            }
        } else {
            this.state = 'MOVING';
            this.moveAlongPath(deltaTime);
        }
    }
}

export class HybridUnit extends Unit {
    // "Hybrid": Moves AND attacks simultaneously.
    // Units: Saber Rider
    updateBehavior(deltaTime) {
        // SPECIAL CASE: If at Enemy Base, STOP and Siege it (if enabled)
        if (this.siegesBase && this.game.enemyBase && this.game.enemyBase.active) {
            const dist = Math.sqrt((this.game.enemyBase.x - this.x) ** 2 + (this.game.enemyBase.y - this.y) ** 2);
            if (dist < this.range) {
                this.state = 'ATTACKING';
                if (this.cooldown <= 0) this.shoot(this.game.enemyBase);
                return; // Stop moving!
            }
        }

        // Otherwise: Run & Gun (Always move)
        this.state = 'MOVING'; // Effectively moving, even if shooting
        this.moveAlongPath(deltaTime);

        // Also check for targets to shoot while moving
        let target = this.findTarget();
        if (target && this.cooldown <= 0) {
            this.shoot(target);
        }
    }
}

export class CrawlerUnit extends Unit {
    // "Crawler": Goes straight to base, ignoring path.
    // Units: Crawler (uses Grunt sprite)
    constructor(game, path, type) {
        super(game, path, type);

        // Calculate direct vector to end of path
        // Crawler targets base coordinates mostly, but we should define it relative to enemyBase if possible
        if (game.enemyBase) {
            this.endPoint = { x: game.enemyBase.x, y: game.enemyBase.y };
        } else if (this.path && this.path.length > 0) {
            this.endPoint = this.path[this.path.length - 1];
        } else {
            this.endPoint = { x: 800, y: 600 }; // Fallback
        }
    }

    updateBehavior(deltaTime) {
        // Straight line movement logic
        this.state = 'MOVING';

        const dx = this.endPoint.x - this.x;
        const dy = this.endPoint.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (this.siegesBase && distance < this.range && this.game.enemyBase && this.game.enemyBase.active) {
            // Stop and Attack Base if close enough
            this.state = 'ATTACKING';
            if (this.cooldown <= 0) {
                this.shoot(this.game.enemyBase);
            }
        } else if (distance < 5) {
            this.reachBase();
        } else {
            const moveX = (dx / distance) * this.speed * (deltaTime / 1000);
            const moveY = (dy / distance) * this.speed * (deltaTime / 1000);
            this.x += moveX;
            this.y += moveY;

            // Update direction based on primary movement axis
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            if (absDx > absDy) {
                this.direction = dx > 0 ? 'right' : 'left';
            } else if (absDy > 1) {
                this.direction = dy > 0 ? 'down' : 'up';
            }
        }
    }
}

export class SpiderUnit extends Unit {
    // "Spider": Attaches to towers, disables them, and drains their health
    constructor(game, path, type) {
        super(game, path, type);

        this.attachedTo = null; // Tower reference when attached
        this.drainRate = 10; // HP per second drained from tower
        this.attachRange = 150; // Detection range for towers
        this.state = 'MOVING'; // MOVING, ATTACHING, ATTACHED
        this.attachAnimTimer = 0;
        this.attachAnimDuration = 300; // ms for 2-frame animation
    }

    updateBehavior(deltaTime) {
        if (this.state === 'ATTACHED') {
            // Stay attached and drain tower health
            if (this.attachedTo && this.attachedTo.active) {
                // Position spider on tower
                this.x = this.attachedTo.x;
                this.y = this.attachedTo.y;

                // Drain tower health
                const drainAmount = (this.drainRate * deltaTime) / 1000;
                this.attachedTo.takeDamage(drainAmount);

                // Keep tower disabled
                this.attachedTo.disabled = true;
            } else {
                // Tower destroyed or inactive, detach
                this.detach();
                this.state = 'MOVING';
            }
            return;
        }

        if (this.state === 'ATTACHING') {
            // Play attaching animation
            this.attachAnimTimer += deltaTime;
            if (this.attachAnimTimer >= this.attachAnimDuration) {
                // Animation complete, fully attach
                this.state = 'ATTACHED';
                this.attachAnimTimer = 0;
                if (this.attachedTo) {
                    this.attachedTo.attachedSpiders.push(this);
                }
            }
            return;
        }

        // MOVING state: find and approach towers
        let targetTower = this.findNearestTower();

        if (targetTower) {
            // Move toward tower
            const dx = targetTower.x - this.x;
            const dy = targetTower.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 20) {
                // Close enough, start attaching
                this.state = 'ATTACHING';
                this.attachedTo = targetTower;
                this.attachAnimTimer = 0;
            } else {
                // Move toward tower
                const moveX = (dx / distance) * this.speed * (deltaTime / 1000);
                const moveY = (dy / distance) * this.speed * (deltaTime / 1000);
                this.x += moveX;
                this.y += moveY;

                // Update direction for walk animation
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);
                if (absDx > absDy) {
                    this.direction = dx > 0 ? 'right' : 'left';
                } else if (absDy > 1) {
                    this.direction = dy > 0 ? 'down' : 'up';
                }
            }
        } else {
            // No towers nearby, continue along path (fallback)
            this.moveAlongPath(deltaTime);
        }
    }

    findNearestTower() {
        let nearestTower = null;
        let minDist = Infinity;

        this.game.towers.forEach(tower => {
            // Don't target base or already attached towers
            if (!tower.active || tower.type === 'base_castle' || tower.disabled) return;

            const dist = Math.sqrt((tower.x - this.x) ** 2 + (tower.y - this.y) ** 2);
            if (dist < this.attachRange && dist < minDist) {
                minDist = dist;
                nearestTower = tower;
            }
        });

        return nearestTower;
    }

    detach() {
        if (this.attachedTo) {
            // Remove spider from tower's list
            const index = this.attachedTo.attachedSpiders.indexOf(this);
            if (index > -1) {
                this.attachedTo.attachedSpiders.splice(index, 1);
            }

            // Re-enable tower if no more spiders attached
            if (this.attachedTo.attachedSpiders.length === 0) {
                this.attachedTo.disabled = false;
            }

            this.attachedTo = null;
        }
    }

    takeDamage(amount) {
        super.takeDamage(amount);

        // If killed while attached, detach and re-enable tower
        if (!this.active && this.attachedTo) {
            this.detach();
        }
    }
}


// --- FACTORY ---

export class UnitFactory {
    static createUnit(game, path, type) {
        switch (type) {
            case 'unit_tank':
            case 'unit_basic': // "Brute" / Grunt
                return new AttackerUnit(game, path, type);

            case 'unit_golem':
            case 'unit_mecha_dino':
                return new SiegerUnit(game, path, type);

            case 'unit_saber_rider':
                return new HybridUnit(game, path, type);

            case 'unit_crawler':
                return new CrawlerUnit(game, path, type);

            case 'unit_spider':
                return new SpiderUnit(game, path, type);

            default:
                console.warn(`Unknown unit type ${type}, defaulting to Attacker.`);
                return new AttackerUnit(game, path, type);
        }
    }
}
