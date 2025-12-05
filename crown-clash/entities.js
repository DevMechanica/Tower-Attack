
export class Entity {
    constructor(x, y, radius, color, team) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.team = team; // 'player' or 'enemy'
        this.isDead = false;
        this.id = Math.random().toString(36).substr(2, 9);
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

export class Unit extends Entity {
    constructor(x, y, type, team) {
        const stats = Unit.getStats(type);
        const color = team === 'player' ? '#3498db' : '#e74c3c';
        super(x, y, stats.radius, color, team);

        this.type = type;
        this.hp = stats.hp;
        this.maxHp = stats.hp;
        this.damage = stats.damage;
        this.range = stats.range;
        this.speed = stats.speed;
        this.attackSpeed = stats.attackSpeed;
        this.lastAttackTime = 0;
        this.target = null;
        this.state = 'moving'; // moving, attacking
    }

    static getStats(type) {
        const stats = {
            knight: { hp: 600, damage: 75, range: 40, speed: 60, attackSpeed: 1.2, radius: 15, cost: 3 },
            archer: { hp: 200, damage: 45, range: 120, speed: 70, attackSpeed: 0.8, radius: 12, cost: 3 },
            giant: { hp: 2000, damage: 120, range: 40, speed: 40, attackSpeed: 1.5, radius: 25, cost: 5, targetBuildings: true }
        };
        return stats[type] || stats.knight;
    }

    update(dt, enemies, towers) {
        if (this.isDead) return;

        // 1. Find target if none or dead
        if (!this.target || this.target.isDead) {
            this.target = this.findTarget(enemies, towers);
        }

        if (this.target) {
            const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
            // Check if in range (account for target radius)
            if (dist <= this.range + this.target.radius) {
                this.state = 'attacking';
                this.attack(dt);
            } else {
                this.state = 'moving';
                this.moveTo(this.target, dt);
            }
        } else {
            // No target, move forward (up or down lane)
            this.state = 'moving';
            const direction = this.team === 'player' ? -1 : 1;
            this.y += this.speed * dt * direction;
        }
    }

    moveTo(target, dt) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0) {
            this.x += (dx / dist) * this.speed * dt;
            this.y += (dy / dist) * this.speed * dt;
        }
    }

    attack(dt) {
        const now = Date.now() / 1000;
        if (now - this.lastAttackTime >= this.attackSpeed) {
            this.target.takeDamage(this.damage);
            this.lastAttackTime = now;
            // Visual flair could go here
        }
    }

    findTarget(enemies, towers) {
        // Priority: Closest enemy in aggro range
        // For simplicity: Setup simplistic targeting. 
        // If Giant, only target towers/buildings unless none exist.

        let potentialTargets = [...enemies, ...towers];

        // Filter out dead
        potentialTargets = potentialTargets.filter(e => !e.isDead);

        if (this.type === 'giant') {
            const buildings = potentialTargets.filter(e => e instanceof Tower);
            if (buildings.length > 0) potentialTargets = buildings;
        }

        let closest = null;
        let minMsg = Infinity;

        for (const t of potentialTargets) {
            const dist = Math.hypot(t.x - this.x, t.y - this.y);
            // Simple aggro range? Or global? Let's do global for "lane pushing" feel
            // But prefer things in same lane?
            // For now: absolute closest
            if (dist < minMsg) {
                minMsg = dist;
                closest = t;
            }
        }
        return closest;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
        }
    }

    draw(ctx) {
        super.draw(ctx);
        // Draw HP bar
        const hpPct = this.hp / this.maxHp;
        const w = 30;
        const h = 5;
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - w / 2, this.y - this.radius - 10, w, h);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(this.x - w / 2, this.y - this.radius - 10, w * hpPct, h);
    }
}

export class Tower extends Entity {
    constructor(x, y, team, isKing) {
        const radius = isKing ? 35 : 25;
        const color = team === 'player' ? '#2980b9' : '#c0392b';
        super(x, y, radius, color, team);

        this.isKing = isKing;
        this.hp = isKing ? 4000 : 2500;
        this.maxHp = this.hp;
        this.damage = isKing ? 100 : 80;
        this.range = 150;
        this.attackSpeed = 1.0;
        this.lastAttackTime = 0;
        this.target = null;

        // Projectiles list managed by Game actually, but tower can spawn them. 
        // For simplicity, instant hit for now, or just logic here.
    }

    update(dt, enemies) {
        if (this.isDead) return;

        // Find target
        if (!this.target || this.target.isDead || Math.hypot(this.target.x - this.x, this.target.y - this.y) > this.range) {
            this.target = this.findTarget(enemies);
        }

        if (this.target) {
            const now = Date.now() / 1000;
            if (now - this.lastAttackTime >= this.attackSpeed) {
                this.shoot(this.target);
                this.lastAttackTime = now;
            }
        }
    }

    findTarget(enemies) {
        let closest = null;
        let minMsg = this.range; // Start with max range

        for (const e of enemies) {
            if (e.isDead) continue;
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            if (dist <= minMsg) {
                minMsg = dist;
                closest = e;
            }
        }
        return closest;
    }

    shoot(target) {
        // Instant damage for MVP simplicity
        // Could fire a projectile object to Game later
        target.takeDamage(this.damage);

        // Visual line
        // (Handled in draw or separate effects list required)
        this.isShooting = true;
        setTimeout(() => this.isShooting = false, 100);
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
        }
    }

    draw(ctx) {
        // Base
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);

        super.draw(ctx);

        // Crown/Top
        if (this.isKing) {
            ctx.fillStyle = 'gold';
            ctx.font = '20px serif';
            ctx.fillText('👑', this.x - 10, this.y + 5);
        }

        // HP Bar
        const hpPct = this.hp / this.maxHp;
        const w = 40;
        const h = 6;
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - w / 2, this.y - this.radius - 15, w, h);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(this.x - w / 2, this.y - this.radius - 15, w * hpPct, h);

        // Shooting line
        if (this.isShooting && this.target) {
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.target.x, this.target.y);
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }
}
