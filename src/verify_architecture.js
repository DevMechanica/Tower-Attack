
import { Game } from './Game.js';
import { CommandType } from './InputManager.js';

// Mock Canvas
const canvas = {
    getContext: () => ({
        clearRect: () => { },
        save: () => { },
        restore: () => { },
        drawImage: () => { },
        beginPath: () => { },
        moveTo: () => { },
        lineTo: () => { },
        stroke: () => { },
        fill: () => { },
        arc: () => { },
        setLineDash: () => { },
        fillRect: () => { },
        scale: () => { },
        translate: () => { },
    }),
    width: 800,
    height: 600,
    addEventListener: () => { },
    getBoundingClientRect: () => ({ left: 0, top: 0 })
};

// Mock Audio
global.Audio = class {
    play() { }
};

// Mock Window
global.window = {
    innerWidth: 800,
    innerHeight: 600,
    addEventListener: () => { },
    requestAnimationFrame: (cb) => setTimeout(cb, 16)
};
global.document = {
    getElementById: () => ({
        addEventListener: () => { },
        classList: { add: () => { }, remove: () => { } },
        style: {},
        appendChild: () => { },
        set innerHTML(v) { }
    }),
    querySelector: () => ({ classList: { remove: () => { } } }),
    createElement: () => ({
        classList: { add: () => { } },
        addEventListener: () => { },
        style: {},
        appendChild: () => { },
        set innerHTML(v) { }
    })
};
global.performance = { now: () => Date.now() };

global.Image = class {
    constructor() {
        this.src = '';
        this.onload = null;
        this.complete = true; // Assume loaded for headless
        this.width = 100;
        this.height = 100;
        // Trigger load
        setTimeout(() => { if (this.onload) this.onload(); }, 0);
    }
};

console.log("Starting Architecture Verification...");

const game = new Game(canvas);
console.log("Game Instantiated.");

// Start Game
game.gameStarted = true;
game.paused = false;

// Send Command
console.log("Sending SPAWN_UNIT Command...");
const spawnCmd = {
    type: CommandType.SPAWN_UNIT,
    unitType: 'unit_basic'
};
// We need to bypass InputManager listener since we can't click, 
// so we call network directly or game directly.
// In the new architecture, InputManager -> NetworkManager -> Game.executeCommand.
// NetworkManager is exposed on game.network.

game.network.sendCommand(spawnCmd);

// Run Update manually (since loop is async/headless)
console.log("Running Update (100ms)...");
game.update(100);

// Check State
console.log("Units in State:", game.state.units.length);

if (game.state.units.length === 1) {
    console.log("SUCCESS: Unit spawned via Command.");

    const unit = game.state.units[0];
    console.log("Unit Position:", unit.x, unit.y);

    // Check Serialization
    const json = unit.serialize();
    console.log("Serialized Unit:", JSON.stringify(json));

    if (json.health && json.type) {
        console.log("SUCCESS: Unit serialization works.");
    } else {
        console.error("FAILURE: Unit serialization missing fields.");
    }

} else {
    // Note: It might fail if Map path is empty. Map loading usually requires images/json?
    // Map.js hardcodes path? or uses assets?
    // If Map path is empty, spawnUnit logic prevents spawn.
    console.error("FAILURE: Unit did not spawn. (Check Map Path?)");
    console.log("Path Length:", game.map.path.length);
}

// Check Render
console.log("Running Render...");
try {
    game.render(0);
    console.log("SUCCESS: Render loop executed without crash.");
} catch (e) {
    console.error("FAILURE: Render crashed.", e);
}

console.log("Verification Complete.");
