export class Projectile {
    constructor(game, x, y, target, type) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.target = target;
        this.type = type; // 'bullet', 'magic', 'laser'

        this.speed = 500; // px per second (was 300)
        this.damage = 25; // was 10
        this.active = true;

        this.radius = 4;
        this.color = '#ffff00';

        if (this.type === 'magic') {
            this.color = '#ff00ff';
            this.damage = 35; // was 15
            this.speed = 400; // was 250
        }
    }

    update(deltaTime) {
        if (!this.active) return;

        if (!this.target || !this.target.active) {
            this.active = false; // Target dead/gone
            return;
        }

        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 10) {
            // Hit!
            this.active = false;
            this.target.takeDamage(this.damage);

            // Visuals
            this.game.effects.spawnExplosion(this.target.x, this.target.y);
            this.game.shake = 5; // Set shake intensity
        } else {
            // Move
            const moveX = (dx / dist) * this.speed * (deltaTime / 1000);
            const moveY = (dy / dist) * this.speed * (deltaTime / 1000);
            this.x += moveX;
            this.y += moveY;
        }
    }

    render(ctx, map) {
        if (!this.active) return;

        const sx = map.offsetX + this.x * map.scale;
        const sy = map.offsetY + this.y * map.scale;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius * map.scale, 0, Math.PI * 2);
        ctx.fill();
    }
}
