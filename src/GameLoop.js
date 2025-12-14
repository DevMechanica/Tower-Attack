
export class GameLoop {
    constructor(updateFn, renderFn, tickRate = 20) {
        this.updateFn = updateFn;
        this.renderFn = renderFn;
        this.tickRate = tickRate;
        this.tickDuration = 1000 / tickRate;
        this.accumulator = 0;
        this.lastTime = 0;
        this.running = false;
        this.frameId = null;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.frameId = requestAnimationFrame((ts) => this.loop(ts));
    }

    stop() {
        this.running = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    loop(timestamp) {
        if (!this.running) return;

        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Cap deltaTime to prevent spiral of death
        // If the game lags significantly (e.g. 100ms+), we don't want to run 10 updates in a row
        // Just cap it to something reasonable like 250ms
        let frameTime = deltaTime;
        if (frameTime > 250) frameTime = 250;

        this.accumulator += frameTime;

        while (this.accumulator >= this.tickDuration) {
            this.updateFn(this.tickDuration); // Fixed tick update
            this.accumulator -= this.tickDuration;
        }

        // Interpolation alpha (optional, for smooth rendering)
        // const alpha = this.accumulator / this.tickDuration;

        this.renderFn(timestamp); // Pass timestamp or alpha if needed

        this.frameId = requestAnimationFrame((ts) => this.loop(ts));
    }
}
