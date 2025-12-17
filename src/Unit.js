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

        // Combat Cooldown
        this.cooldown = 0;
        this.maxCooldown = 1200; // ms
    }

    setupStats() {
        // Defaults
        this.speed = 100;
        this.health = 100;
        this.maxHealth = 100;
        this.radius = 15;
        this.range = 150;
        this.siegesBase = false; // Default: Kamikaze into base. Set true to stop and shoot.

        // Type Specific Overrides
        if (this.type === 'unit_tank') {
            this.health = 300;
            this.maxHealth = 300;
            this.speed = 60;
            this.radius = 20;
        } else if (this.type === 'unit_golem') {
            this.health = 800;
            this.maxHealth = 800;
            this.speed = 40;
            this.radius = 25;
        } else if (this.type === 'unit_mecha_dino') {
            this.health = 400;
            this.maxHealth = 400;
            this.speed = 70;
            this.radius = 30;
        } else if (this.type === 'unit_saber_rider') {
            this.health = 250;
            this.maxHealth = 250;
            this.speed = 120;
            this.radius = 20;
        } else if (this.type === 'unit_crawler') {
            this.health = 80;
            this.maxHealth = 80;
            this.speed = 110;
            this.radius = 15;
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.active = false;
            // Visuals
            if (this.game.effects) this.game.effects.spawnExplosion(this.x, this.y);
            // Grant Gold
            let bounty = 10;
            if (this.type === 'unit_golem') bounty = 50;
            if (this.type === 'unit_tank') bounty = 30;
            if (this.type === 'unit_mecha_dino') bounty = 40;

            this.game.attackerGold += bounty;
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
        const barHeight = 4 * map.scale;
        const barY = screenY - (this.radius * map.scale) - 20 * map.scale;

        ctx.fillStyle = 'red';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth, barHeight);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth * (this.health / this.maxHealth), barHeight);
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

            default:
                console.warn(`Unknown unit type ${type}, defaulting to Attacker.`);
                return new AttackerUnit(game, path, type);
        }
    }
}
