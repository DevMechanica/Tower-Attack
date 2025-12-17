import { Tower, TowerCosts } from '../Tower.js';

export class AIDefender {
    constructor(game, config) {
        this.game = game;
        this.config = config;
        this.enabled = true;
        this.buildCooldown = 0;
        this.buildDelay = 2000; // Wait 2s between builds to simulate thinking
    }

    update(deltaTime) {
        if (!this.enabled) return;

        // Reduce cooldown
        if (this.buildCooldown > 0) {
            this.buildCooldown -= deltaTime;
            return;
        }

        // Check if we can afford a tower
        // Use cheapest tower cost or standard
        const minCost = 50;
        if (this.game.defenderGold >= minCost) {
            this.tryPlaceTower();
        }
    }

    tryPlaceTower() {
        // Find all empty slots
        const validSlots = this.game.map.towerSlots.filter(s => !s.occupied);

        if (validSlots.length === 0) return;

        // Strategy: basic_expansion (Random for now, but prioritized near path)
        // In this game, all slots are near path by definition of generation, 
        // so random valid slot is actually a decent heuristic for Level 1.

        const randomIndex = Math.floor(Math.random() * validSlots.length);
        const slot = validSlots[randomIndex];

        // Place Tower
        // We use the Game's method if exposed, or manually push. 
        // Game.js has tryPlaceTower(x, y, type) which handles cost? 
        // Let's check Game.js. It checks collision but might not handle AI cost deduction directly if it relies on "Player" state.
        // We will call a simplified internal method or just push to array and deduct gold.

        // Actually, we should use the Game's public method to ensure consistency, 
        // but we need to act as Defender.

        // Costs (from TowerCosts)
        const costs = TowerCosts;

        // Pick a random tower from the allowed list
        const allowed = this.config.allowedTowers || ['tower_cannon'];
        // Filter by affordability
        const affordable = allowed.filter(type => this.game.defenderGold >= (costs[type] || 50));

        if (affordable.length === 0) return; // Can't afford anything

        const randomType = affordable[Math.floor(Math.random() * affordable.length)];
        const cost = costs[randomType] || 50;

        // Place and Deduct
        // this.game.placeTowerAI(slot.x, slot.y, randomType); <--- REPLACED
        this.placeTower(slot, randomType);

        this.game.defenderGold -= cost;
        this.game.updateUI(); // Force update

        this.buildCooldown = this.buildDelay + Math.random() * 1000; // Random delay
    }

    placeTower(slot, type) {
        // Direct State Manipulation (Authorized for AI)
        // We assume slot is valid and free as checked above.

        // 1. Create Tower
        // Need to ensure Tower is available. We don't have Tower class imported?
        // Game instance has it? No, game has state.
        // We need to import Tower class.
        // Actually, let's just push to game state.

        // Dynamic Import or assume it's available? No, must import.
        // I will add import at top of file.

        const tower = new Tower(this.game, slot.x, slot.y, type);
        this.game.state.towers.push(tower);

        // 2. Mark Slot
        slot.occupied = true;

        // 3. Audio
        this.game.audio.playPlacingTower();
    }
}
