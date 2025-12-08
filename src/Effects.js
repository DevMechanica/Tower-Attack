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
