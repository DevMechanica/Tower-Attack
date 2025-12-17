import { Game } from './Game.js';


// Use DOMContentLoaded to attach listeners ASAP, before large assets finish loading
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    // Mode Toggle Logic
    const modeBtn = document.getElementById('mode-toggle-btn');
    const params = new URLSearchParams(window.location.search);
    let currentMode = params.get('mode');

    // Auto-detect defaults if missing
    if (!currentMode) {
        const hostname = window.location.hostname;
        currentMode = (hostname === 'localhost' || hostname === '127.0.0.1') ? 'local' : 'online';
    }

    if (modeBtn) {
        if (currentMode === 'online') {
            modeBtn.innerText = "SWITCH TO LOCAL";
            modeBtn.onclick = () => window.location.search = '?mode=local';
        } else {
            modeBtn.innerText = "SWITCH TO ONLINE";
            modeBtn.onclick = () => window.location.search = '?mode=online';
        }
    }

    const game = new Game(canvas);
    game.start();
});
