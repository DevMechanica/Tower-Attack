
export class GameState {
    constructor() {
        this.lives = 20;
        this.gold = 100;
        this.time = 0;

        // Entities
        this.units = [];       // Array of Unit objects (or data)
        this.towers = [];      // Array of Tower objects (or data)
        this.projectiles = []; // Array of Projectile objects

        // Map State (Simpler to just track occupied slots? Or reference Map?)
        // Ideally GameState contains *all* mutable state. 
        // Static map data (paths, slots positions) doesn't need to be here, 
        // BUT 'occupied' status of slots DOES.
        this.occupiedSlots = []; // Array of {x, y} or slot indices
    }

    serialize() {
        return {
            lives: this.lives,
            gold: this.gold,
            time: this.time,
            units: this.units.map(u => u.serialize ? u.serialize() : u),
            towers: this.towers.map(t => t.serialize ? t.serialize() : t),
            projectiles: this.projectiles.map(p => p.serialize ? p.serialize() : p),
            occupiedSlots: this.occupiedSlots
        };
    }

    deserialize(data) {
        this.lives = data.lives;
        this.gold = data.gold;
        this.time = data.time;
        // logic to re-instantiate entities will be handled by Game.js or separate factory
        // For now, raw data:
        this.units = data.units || [];
        this.towers = data.towers || [];
        this.projectiles = data.projectiles || [];
        this.occupiedSlots = data.occupiedSlots || [];
    }
}
