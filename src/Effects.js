export class EffectManager {
    constructor(game) {
        this.game = game;
        this.effects = [];
    }

    spawnExplosion(x, y) {
        this.effects.push(new Explosion(this.game, x, y));
        // Spawn some smoke particles too
        for (let i = 0; i < 5; i++) {
            this.effects.push(new Particle(this.game, x, y, 'smoke'));
        }
    }

    spawnLightning(x1, y1, x2, y2) {
        this.effects.push(new Lightning(this.game, x1, y1, x2, y2));
    }

    spawnAcidCloud(x, y) {
        this.effects.push(new AcidCloud(this.game, x, y));
    }

    update(deltaTime) {
        this.effects.forEach(effect => effect.update(deltaTime));
        this.effects = this.effects.filter(effect => effect.active);
    }

    render(ctx, map) {
        this.effects.forEach(effect => effect.render(ctx, map));
    }
}

class Explosion {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.active = true;

        this.frame = 0;
        this.totalFrames = 16; // 4x4
        this.timer = 0;
        this.frameDuration = 30; // ms per frame (fast!)

        this.scale = 1.0;
        this.rotation = Math.random() * Math.PI * 2;
    }

    update(deltaTime) {
        this.timer += deltaTime;
        if (this.timer >= this.frameDuration) {
            this.timer = 0;
            this.frame++;
            if (this.frame >= this.totalFrames) {
                this.active = false;
            }
        }
    }

    render(ctx, map) {
        const sprite = map.assets['explosion'];
        if (!sprite || !sprite.complete) return;

        const cols = 4;
        const rows = 4;
        const frameWidth = sprite.width / cols;
        const frameHeight = sprite.height / rows;

        const col = this.frame % cols;
        const row = Math.floor(this.frame / cols);

        const screenX = map.offsetX + this.x * map.scale;
        const screenY = map.offsetY + this.y * map.scale;
        const size = 80 * map.scale; // Reduced from 150

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.rotation);

        // Additive blending makes black transparent and brights glowing
        ctx.globalCompositeOperation = 'screen';

        ctx.drawImage(
            sprite,
            col * frameWidth, row * frameHeight, frameWidth, frameHeight,
            -size / 2, -size / 2, size, size
        );
        ctx.restore();
    }
}

class Particle {
    constructor(game, x, y, type) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.type = type;
        this.active = true;

        this.life = 1.0; // 0 to 1
        this.decay = Math.random() * 0.5 + 0.5; // per second

        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 50 + 20;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.size = Math.random() * 10 + 10;
        this.color = `rgba(100, 100, 100,`;
    }

    update(deltaTime) {
        const dt = deltaTime / 1000;
        this.life -= this.decay * dt;
        if (this.life <= 0) {
            this.active = false;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.size += 10 * dt; // Expand
    }

    render(ctx, map) {
        const screenX = map.offsetX + this.x * map.scale;
        const screenY = map.offsetY + this.y * map.scale;
        const s = this.size * map.scale;

        ctx.fillStyle = `${this.color} ${this.life})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, s, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Lightning {
    constructor(game, x1, y1, x2, y2) {
        this.game = game;
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.active = true;
        this.life = 0.2; // 200ms duration

        // Generate jagged points
        this.points = [];
        this.points.push({ x: x1, y: y1 });

        const segments = 5;
        const dx = x2 - x1;
        const dy = y2 - y1;

        // Calc normalized perpendicular for offset
        const length = Math.sqrt(dx * dx + dy * dy);
        const px = -dy / length;
        const py = dx / length;

        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            // Random offset
            const offset = (Math.random() - 0.5) * 60;

            this.points.push({
                x: x1 + dx * t + (px * offset),
                y: y1 + dy * t + (py * offset)
            });
        }

        this.points.push({ x: x2, y: y2 });
    }

    update(deltaTime) {
        this.life -= deltaTime / 1000;
        if (this.life <= 0) this.active = false;
    }

    render(ctx, map) {
        ctx.save();
        ctx.strokeStyle = `rgba(100, 200, 255, ${this.life * 5})`;
        ctx.lineWidth = 3 * map.scale;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        this.points.forEach((p, index) => {
            const sx = map.offsetX + p.x * map.scale;
            const sy = map.offsetY + p.y * map.scale;
            if (index === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
        ctx.restore();
    }
}

class AcidCloud {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.active = true;
        this.life = 8.0; // 8 seconds duration
        this.radius = 100; // Area of effect
        this.particleTimer = 0;
        this.particles = []; // Acid rain particles

        // Slow effect parameters
        this.slowFactor = 0.5; // 50% speed reduction
        this.slowDuration = 3000; // 3 seconds in ms
    }

    update(deltaTime) {
        // Decay lifetime
        this.life -= deltaTime / 1000;
        if (this.life <= 0) {
            this.active = false;
            return;
        }

        // Spawn acid rain particles periodically
        this.particleTimer += deltaTime;
        if (this.particleTimer >= 100) { // Every 100ms
            this.particleTimer = 0;
            // Create falling acid particle
            this.particles.push({
                x: this.x + (Math.random() - 0.5) * this.radius * 2,
                y: this.y - 50,
                vy: 80, // Fall speed
                life: 1.0,
                size: Math.random() * 3 + 2
            });
        }

        // Update particles
        this.particles.forEach(p => {
            p.y += p.vy * (deltaTime / 1000);
            p.life -= deltaTime / 1000;
        });
        this.particles = this.particles.filter(p => p.life > 0);

        // Apply slow effect to enemies in range
        this.game.units.forEach(unit => {
            if (!unit.active) return;

            const dx = unit.x - this.x;
            const dy = unit.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.radius) {
                // Apply slow effect
                if (unit.applySlowEffect) {
                    unit.applySlowEffect(this.slowFactor, this.slowDuration);
                }
            }
        });
    }

    render(ctx, map) {
        const screenX = map.offsetX + this.x * map.scale;
        const screenY = map.offsetY + this.y * map.scale;

        // Draw green cloud (pulsing gradient)
        const alpha = Math.min(0.6, this.life / 8.0 * 0.6);
        const pulse = 0.9 + Math.sin(Date.now() / 200) * 0.1;
        const cloudRadius = this.radius * map.scale * pulse;

        const gradient = ctx.createRadialGradient(
            screenX, screenY, 0,
            screenX, screenY, cloudRadius
        );
        gradient.addColorStop(0, `rgba(100, 255, 100, ${alpha})`);
        gradient.addColorStop(0.5, `rgba(50, 200, 50, ${alpha * 0.6})`);
        gradient.addColorStop(1, 'rgba(0, 150, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, cloudRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw acid rain particles
        ctx.fillStyle = 'rgba(150, 255, 100, 0.8)';
        this.particles.forEach(p => {
            const px = map.offsetX + p.x * map.scale;
            const py = map.offsetY + p.y * map.scale;
            const size = p.size * map.scale;

            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        });
    }
}
