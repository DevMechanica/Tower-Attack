
export const CommandType = {
    SPAWN_UNIT: 'SPAWN_UNIT',
    PLACE_TOWER: 'PLACE_TOWER',
    SELL_TOWER: 'SELL_TOWER'
};

export class InputManager {
    constructor(canvas, map, networkManager, gameState) {
        this.canvas = canvas;
        this.map = map; // Needed for coordinate conversion
        this.networkManager = networkManager;
        this.gameState = gameState;

        // Input State
        this.selectedCard = null; // 'unit_basic', 'tower_cannon'
        this.selectedEntity = null; // Tower object
    }

    setupListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));

        // Listen for UI events (dispatched from UI DOM elements)
        // Or we can expose methods like "selectCard(id)"
    }

    handleMouseDown(e) {
        const coords = this.map.getGameCoordinates(e.clientX, e.clientY);
        if (!coords) return;

        // 1. Spawning / Placing
        if (this.selectedCard) {
            if (this.selectedCard.startsWith('unit')) {
                // Spawn Command
                const cmd = {
                    type: CommandType.SPAWN_UNIT,
                    unitType: this.selectedCard,
                    // Units usually spawn at path start, but command structure is extensible
                };
                this.networkManager.sendCommand(cmd);
            } else if (this.selectedCard.startsWith('tower')) {
                // Place Tower Command
                const cmd = {
                    type: CommandType.PLACE_TOWER,
                    towerType: this.selectedCard,
                    x: coords.x,
                    y: coords.y
                };
                this.networkManager.sendCommand(cmd);
            }
            return; // Don't select if placing
        }

        // 2. Selection (Defender only?)
        // Let's allow selecting towers.
        // Hit Test against towers in GameState
        // We need to access towers.
        const towers = this.gameState.towers;
        const clickedTower = towers.find(t => {
            return Math.abs(t.x - coords.x) < 30 && Math.abs(t.y - coords.y) < 30;
        });

        if (clickedTower) {
            this.selectedEntity = clickedTower;
            console.log("Selected:", clickedTower);
        } else {
            this.selectedEntity = null;
        }
    }

    // UI Helpers
    selectCard(id) {
        this.selectedCard = id;
        // Clear entity selection if we pick a card
        if (id) this.selectedEntity = null;
    }

    triggerSell() {
        if (!this.selectedEntity) return;

        // Identify tower. By reference? Or coordinates?
        // Command needs to identify it.
        // { type: SELL_TOWER, x: ..., y: ... } is safest for grid based.

        const cmd = {
            type: CommandType.SELL_TOWER,
            x: this.selectedEntity.x,
            y: this.selectedEntity.y
        };
        this.networkManager.sendCommand(cmd);

        this.selectedEntity = null; // Clear selection locally immediately? 
        // Or wait for state update? 
        // Better to clear immediately for UI responsiveness.
    }
}
