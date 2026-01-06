
import { Map } from './Map.js';
import { Unit, UnitFactory } from './Unit.js';
import { Tower, TowerCosts } from './Tower.js';
import { EffectManager } from './Effects.js';
import { AudioManager } from './AudioManager.js';

// New Architecture Imports
import { GameState } from './GameState.js';
import { GameLoop } from './GameLoop.js';
import { Renderer } from './Renderer.js';
import { NetworkManager } from './NetworkManager.js';
import { InputManager, CommandType } from './InputManager.js';
import { Level1Config } from './levels/Level1.js';
import { MasterLevelConfig } from './levels/MasterLevel.js';
import { PresetLevelConfig } from './levels/PresetLevel.js';
import { AIDefender } from './ai/AIDefender.js';
import { DeckManager } from './DeckManager.js';

export class Game {
    constructor(canvas) {
        // --- 1. Infrastructure ---
        this.canvas = canvas;
        this.audio = new AudioManager();
        this.map = new Map(this); // Map needs game ref for assets? Or just Context? 
        // Map constructor usually takes (game).

        // --- 2. State Layer ---
        this.state = new GameState();

        // --- 3. Proxies for Legacy Code (Unit/Tower compatibility) ---
        // Unit.js uses game.units, game.defenderLives, etc.
        // We link them to state.

        // --- 4. Network Layer ---
        this.network = new NetworkManager();
        this.network.setCommandHandler((cmd) => this.executeCommand(cmd));

        // --- 4.5 Deck Manager ---
        this.deckManager = new DeckManager();

        // Listen for Role Assignment
        this.network.onRoleAssigned = (role) => {
            // CAMPAIGN OVERRIDE: Ignore network roles in campaign mode
            if (this.gamemode === 'campaign') {
                console.log(`[Game] Network assigned ${role}, but ignoring for Campaign Mode.`);
                return;
            }

            console.log(`[Game] Role Assigned: ${role.toUpperCase()}`);
            this.role = role;
            this.renderCards();

            // WE ARE CONNECTED!
            const statusParams = document.querySelector('#welcome-screen p');
            if (statusParams) {
                statusParams.innerText = `Role Assigned: ${role.toUpperCase()}. Waiting for Match...`;
                statusParams.style.color = "#ffff00";
            }

            const startBtn = document.getElementById('start-btn');
            if (startBtn) {
                if (this.localReady) {
                    // We clicked ready BEFORE matching. Re-send it now!
                    console.log("[Game] Matched after Ready. Resending READY.");
                    this.network.sendCommand({ type: CommandType.READY });
                    startBtn.innerText = "WAITING FOR OPPONENT...";
                } else {
                    // Enable button
                    startBtn.innerText = "START GAME";
                    startBtn.disabled = false;
                    startBtn.style.opacity = "1";
                    startBtn.style.cursor = "pointer";
                    // Play sound?
                }
            } else {
                // If button is gone (Auto-Start UI)
                // We assume auto-ready for now or just wait.
                // In revised flow, we are 'localReady' from the start logic.
                // We just need to ensure we send READY and update Text.
                if (this.localReady) {
                    this.network.sendCommand({ type: CommandType.READY });
                    if (statusParams) statusParams.innerText = "Connected! Waiting for Opponent...";
                }
            }

            // Visual Indicator
            const roleBtn = document.getElementById('role-switch-btn');
            if (roleBtn) {
                roleBtn.innerText = `Role: ${role.toUpperCase()}`;
                roleBtn.disabled = true; // Lock it
                roleBtn.style.opacity = "0.7";
                roleBtn.style.cursor = "default";
            }
        };

        this.network.onStatusChange = (status) => {
            const statusParams = document.querySelector('#welcome-screen p');
            if (statusParams) {
                statusParams.innerText = status;
                statusParams.style.color = "#ffff00";
            }
        };

        this.network.onPeerDiscovered = () => {
            console.log("[Game] Peer Discovered attempting to sync state...");
            if (this.localReady) {
                console.log("[Game] Re-broadcasting READY state to new peer.");
                this.network.sendCommand({ type: CommandType.READY });
            }
        };

        // Start Connection Logic: DELAYED until mode selection
        // this.network.connect();

        // --- 5. Input Layer ---
        this.input = new InputManager(canvas, this.map, this.network, this.state);
        this.input.setupListeners(); // Ensure we actually start listening!

        // --- 6. View Layer ---
        this.renderer = new Renderer(canvas);
        this.effects = new EffectManager(this); // Effects might need proxies too

        // --- 7. Control Layer ---
        this.loop = new GameLoop(
            (dt) => this.update(dt),
            (ts) => this.render(ts)
        );

        // --- 8. UI/Game Flow ---
        // (Keep Setup Logic from old Game.js)
        this.paused = true;
        this.gameStarted = false;

        // Mode State
        this.gamemode = null;
        this.config = null;

        this.setupUI();
        this.setupMenu();
        this.setupPauseMenu();
        this.setupWelcome();

        // Initial Resize
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Right Click Cancel
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.deselectAll();
        });

        this.attackerNextSpawnTime = 0; // Cooldown Tracker
    }

    deselectAll() {
        this.input.selectedCard = null;
        this.input.selectedEntity = null;
        // Update UI visuals
        const prev = document.querySelector('.card.selected');
        if (prev) prev.classList.remove('selected');
        this.renderCards(); // Refresh dock state if needed
        this.updateUI(); // Hide sell button
    }

    // --- State Proxies for Unit/Tower/Effects ---
    get units() { return this.state.units; }
    set units(v) { this.state.units = v; }

    get towers() { return this.state.towers; }
    set towers(v) { this.state.towers = v; }

    get projectiles() { return this.state.projectiles; }
    set projectiles(v) { this.state.projectiles = v; }

    get defenderLives() { return this.state.lives; }
    set defenderLives(v) { this.state.lives = v; }

    get attackerGold() { return this.state.gold; }
    set attackerGold(v) { this.state.gold = v; }


    // --- Core Loops ---
    start() {
        this.loop.start();
    }

    update(deltaTime) {
        if (!this.gameStarted || this.paused) return;

        this.state.time += deltaTime;

        // Update Entities
        // Note: Unit.update(dt) currently handles movement, logic, AND physics.
        // In a pure ECS, this would be System loops. 
        // Here we delegate to the Entity Class (Fat Model).

        this.map.update(deltaTime); // Map might have logic?

        this.state.units.forEach(u => u.update(deltaTime));
        this.state.units = this.state.units.filter(u => u.active);

        this.state.towers.forEach(t => t.update(deltaTime)); // Towers might shoot (create projectiles)
        this.state.towers = this.state.towers.filter(t => t.active);

        this.state.projectiles.forEach(p => p.update(deltaTime));
        this.state.projectiles = this.state.projectiles.filter(p => p.active);

        this.effects.update(deltaTime);

        // Shake Decay handled in Renderer? Or State?
        // Old code had this.shake. Let's proxy shake too if needed, or move to Renderer.
        // For now, let's assume effects handles shake or we omit it for MVP refactor.

        this.updateUI(); // Keep UI updates

        // Campaign Logic
        if (this.gamemode === 'campaign' && this.gameStarted) {
            if (this.ai) this.ai.update(deltaTime);

            // Win Condition: Destroy all towers
            // Check if towers exist first to avoid instant win at 0s
            // We can check if AI has placed AT LEAST one tower ever, or just wait a few seconds.
            // Better: Check if AIDefender is active and towers.length == 0 AND lives > 0?
            // Actually config says: "Wins if all defender towers are destroyed"

            if (this.enemyBase) {
                // Sync UI Lives to Base Health
                this.defenderLives = Math.max(0, this.enemyBase.health);
                this.state.lives = this.defenderLives;

                if (!this.enemyBase.active || this.defenderLives <= 0) {
                    this.endGame(true, "VICTORY!");
                }
            } else if (this.state.time > 3000 && this.state.towers.length === 0) {
                // Fallback if no base exists (legacy/other levels)
                this.endGame(true, "VICTORY! All towers destroyed.");
            }



            // Loss Condition: Run out of gold and units
            // And can't afford cheapest unit
            // Only trigger loss if VICTORY didn't happen (Active base)
            if (this.enemyBase && this.enemyBase.active && this.state.units.length === 0 && this.attackerGold < 10) {
                this.endGame(false, "DEFEAT! Out of resources.");
            }
        }
    }

    endGame(victory, message) {
        this.paused = true;
        this.gameStarted = false;

        // Create Overlay if not exists
        let overlay = document.getElementById('game-over-screen');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'game-over-screen';
            overlay.className = 'glass-panel full-screen-overlay';
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.background = 'rgba(0, 0, 0, 0.85)';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.justifyContent = 'center';
            overlay.style.alignItems = 'center';
            overlay.style.zIndex = '1000';
            overlay.innerHTML = `
                <h1 id="game-over-title" style="font-size: 4rem; margin-bottom: 20px;">VICTORY</h1>
                <p id="game-over-msg" style="font-size: 1.5rem; margin-bottom: 40px; color: #ddd;"></p>
                <div class="menu-buttons">
                    <button id="go-restart-btn" class="primary-btn">REPLAY</button>
                    <button id="go-menu-btn" class="secondary-btn">MAIN MENU</button>
                </div>
            `;
            document.body.appendChild(overlay);

            // Add Listeners
            document.getElementById('go-restart-btn').onclick = () => location.reload();
            document.getElementById('go-menu-btn').onclick = () => location.reload();
        }

        const title = overlay.querySelector('#game-over-title');
        const msg = overlay.querySelector('#game-over-msg');

        title.innerText = victory ? "VICTORY" : "DEFEAT";
        title.style.color = victory ? "#4dff4d" : "#ff4d4d"; // Green vs Red
        msg.innerText = message || (victory ? "The Enemy Base is Destroyed!" : "You ran out of resources.");

        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
    }



    render(timestamp) {
        // Increment frame counter for video cache invalidation
        if (!this._frameCounter) this._frameCounter = 0;
        this._frameCounter++;
        this._videoFrameCacheTimestamp = this._frameCounter;

        // Delegate to Renderer
        this.renderer.draw(this.state, this.map);

        // Effects are strictly visual, so Renderer should probably draw them?
        // OR we draw them on top here.
        // Original Game.js: effects.render(ctx, map) was at end of render.
        this.effects.render(this.renderer.ctx, this.map);
    }

    // --- Command Execution ---
    executeCommand(cmd) {
        console.log("Executing", cmd);

        if (cmd.type === CommandType.READY) {
            // Ignore our own Ready signal (handled by UI click)
            if (cmd.playerId === this.network.clientId) return;

            console.log(`[Game] Opponent ${cmd.playerId} is READY`);

            const statusParams = document.querySelector('#welcome-screen p');
            if (statusParams) statusParams.innerText = "Opponent Ready! Checking start...";

            this.remoteReady = true;
            this.checkStartCondition();

            if (statusParams && !this.gameStarted) {
                statusParams.innerText = "Opponent is Ready! Waiting for you...";
                statusParams.style.color = "#00ff00";
            }
        }

        if (cmd.type === CommandType.SPAWN_UNIT) {
            // Logic moved from spawnUnit
            // Validation: Check Gold?
            // If validation passes:
            if (this.map.path.length > 0) {
                let spawnPath = this.map.path;

                // If Defender spawned it, REVERSE the path!
                if (cmd.role === 'defender') {
                    // Clone and reverse to avoid mutating the original singleton path
                    spawnPath = [...this.map.path].reverse();
                }

                this.state.units.push(UnitFactory.createUnit(this, spawnPath, cmd.unitType, cmd.role));
                // Cost deduction logic should be here.
            }
        }
        else if (cmd.type === CommandType.PLACE_TOWER) {
            // Logic moved from tryPlaceTower
            // Check if slot free
            const range = 40;
            const slot = this.map.towerSlots.find(s => {
                const dx = s.x - cmd.x;
                const dy = s.y - cmd.y;
                return Math.sqrt(dx * dx + dy * dy) < range && !s.occupied;
            });

            if (slot) {
                this.state.towers.push(new Tower(this, slot.x, slot.y, cmd.towerType));
                slot.occupied = true;
                this.audio.playPlacingTower();
            }
        }
        else if (cmd.type === CommandType.SELL_TOWER) {
            // FIND and SELL
            const tower = this.state.towers.find(t => t.x === cmd.x && t.y === cmd.y);
            if (tower) {
                tower.active = false; // Mark for removal

                // Free slot
                const slot = this.map.towerSlots.find(s => Math.abs(s.x - cmd.x) < 5 && Math.abs(s.y - cmd.y) < 5);
                if (slot) slot.occupied = false;

                // Refund?
                // this.attackerGold += ... wait, defender doesn't have gold? 
                // Currently gold is attackerGold in constructor.
                // Assuming defender has money too, but not implemented in old Game.js yet?
                // Ah, lives only.
            }
        }
    }


    // --- Lobby Logic ---
    checkStartCondition() {
        if (this.localReady && this.remoteReady && !this.gameStarted) {
            console.log("[Game] Both Players Ready! STARTING!");
            this.startGameplay();
        }
    }

    startGameplay() {
        this.gameStarted = true;
        const welcomeScreen = document.getElementById('welcome-screen');
        const hudTop = document.getElementById('hud-top');
        const cardDock = document.getElementById('card-dock');
        const roleBtn = document.getElementById('role-switch-btn');
        const menuBtn = document.getElementById('menu-btn');
        const matchWidget = document.getElementById('matchmaking-status'); // NEW
        const appRootMenu = document.getElementById('app-root-menu'); // NEW MENU ROOT

        if (welcomeScreen) welcomeScreen.classList.add('hidden');
        if (appRootMenu) appRootMenu.classList.add('hidden'); // CRITICAL FIX: Hide new menu
        if (matchWidget) matchWidget.classList.add('hidden'); // Fix: Hide widget if game starts
        if (hudTop) hudTop.classList.remove('hidden');
        if (cardDock) cardDock.classList.remove('hidden');
        if (roleBtn) roleBtn.classList.remove('hidden');
        if (menuBtn) menuBtn.classList.remove('hidden');

        this.paused = false;
        this.lastTime = performance.now();
        this.start(); // Start the Loop!
    }



    // Override setupWelcome for Campaign
    setupWelcome() {
        const campaignBtn = document.getElementById('campaign-btn');
        const multiplayerBtn = document.getElementById('multiplayer-btn');
        const statusText = document.querySelector('#welcome-content p') || document.querySelector('#welcome-screen p');

        // New Menu Interaction Logic
        const playBtn = document.getElementById('play-battle-btn');
        const modePopup = document.getElementById('mode-select-popup');
        const modeCloseBtn = document.getElementById('mode-close-btn');

        if (playBtn && modePopup) {
            playBtn.addEventListener('click', () => {
                modePopup.classList.remove('hidden');
            });
        }
        // Duplicate Removed
        // Brace removed to fix scope


        if (modeCloseBtn && modePopup) {
            modeCloseBtn.addEventListener('click', () => {
                modePopup.classList.add('hidden');
            });
        }


        // --- DOCK BUTTON LISTENERS (Shop, Units, Towers, Social, Events) ---
        const shopBtn = document.getElementById('shop-btn');
        const shopModal = document.getElementById('shop-modal');
        const shopClose = document.getElementById('shop-close-btn');

        const socialBtn = document.getElementById('social-btn');
        const socialModal = document.getElementById('social-modal');
        const socialClose = document.getElementById('social-close-btn');

        const eventsBtn = document.getElementById('events-btn');
        const eventsModal = document.getElementById('events-modal');
        const eventsClose = document.getElementById('events-close-btn');

        // Units & Towers (Open Deck Screen)
        const unitsDockBtn = document.getElementById('units-btn');
        const towersDockBtn = document.getElementById('towers-btn');

        if (unitsDockBtn) unitsDockBtn.onclick = () => this.openDeckScreen('units');
        if (towersDockBtn) towersDockBtn.onclick = () => this.openDeckScreen('towers');

        // Settings Logic
        const settingsBtn = document.getElementById('main-settings-btn');
        const settingsModal = document.getElementById('settings-modal');
        const settingsClose = document.getElementById('settings-close-btn');
        const volumeSlider = document.getElementById('volume-slider');

        if (shopBtn && shopModal) shopBtn.onclick = () => shopModal.classList.remove('hidden');
        if (shopClose && shopModal) shopClose.onclick = () => shopModal.classList.add('hidden');

        // Social
        if (socialBtn && socialModal) socialBtn.onclick = () => socialModal.classList.remove('hidden');
        if (socialClose && socialModal) socialClose.onclick = () => socialModal.classList.add('hidden');

        // Events
        if (eventsBtn && eventsModal) eventsBtn.onclick = () => eventsModal.classList.remove('hidden');
        if (eventsClose && eventsModal) eventsClose.onclick = () => eventsModal.classList.add('hidden');

        // Logic Cleaned


        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                settingsModal.classList.remove('hidden');
                // Sync Slider
                if (volumeSlider && this.audio) {
                    volumeSlider.value = Math.floor(this.audio.masterVolume * 100);
                }
            });
        }

        if (settingsClose && settingsModal) {
            settingsClose.addEventListener('click', () => {
                settingsModal.classList.add('hidden');
            });
        }

        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                const vol = parseFloat(e.target.value) / 100; // 0.0 to 1.0
                if (this.audio) {
                    this.audio.setMasterVolume(vol);
                }
            });
        }

        // Campaign Handler
        if (campaignBtn) {
            campaignBtn.addEventListener('click', () => {
                this.showLevelSelect();
            });
        }

        this.setupLevelSelect();

        // Multiplayer Handler
        if (multiplayerBtn) {
            multiplayerBtn.addEventListener('click', () => {
                this.showMultiplayerMenu();
            });
        }

        this.setupMultiplayerMenu();
    }

    setupLevelSelect() {
        this.availableLevels = [
            { id: 'level1', config: Level1Config, label: "Level 1 (Basic)" },
            { id: 'presets', config: PresetLevelConfig, label: "Static Defense (Puzzle)" },
            { id: 'master', config: MasterLevelConfig, label: "Master Level (Sandbox)" }
        ];

        const listContainer = document.getElementById('level-list');
        const backBtn = document.getElementById('level-back-btn');
        const levelScreen = document.getElementById('level-select-screen');
        const welcomeScreen = document.getElementById('welcome-screen');

        this.localReady = false;
        this.remoteReady = false;
        this.isConnected = false;

        if (listContainer) {
            listContainer.innerHTML = '';
            this.availableLevels.forEach(lvl => {
                const btn = document.createElement('button');
                btn.className = 'primary-btn';
                btn.innerText = lvl.label;
                btn.style.width = '100%';
                btn.style.marginBottom = '10px';
                btn.onclick = () => {
                    levelScreen.classList.add('hidden');
                    this.initCampaign(lvl.config);
                };
                listContainer.appendChild(btn);
            });
        }

        if (backBtn) {
            backBtn.onclick = () => {
                const modePopup = document.getElementById('mode-select-popup');
                levelScreen.classList.add('hidden');
                if (modePopup) modePopup.classList.remove('hidden');
            };
        }

        // Visual State: Disable Play until matched
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.innerText = "PLAY";
            startBtn.disabled = true;
            startBtn.style.opacity = "0.5";
            startBtn.style.cursor = "not-allowed";
        }
    }

    showMultiplayerMenu() {
        // Hide Mode Select, Show Multiplayer Menu
        const mpMenu = document.getElementById('multiplayer-menu');
        const modePopup = document.getElementById('mode-select-popup');

        if (modePopup) modePopup.classList.add('hidden');
        if (mpMenu) mpMenu.classList.remove('hidden');
    }

    setupMultiplayerMenu() {
        const mpLocalBtn = document.getElementById('mp-local-btn');
        const mpOnlineBtn = document.getElementById('mp-online-btn');
        const mpBackBtn = document.getElementById('mp-back-btn');
        const mpMenu = document.getElementById('multiplayer-menu');

        // Waiting Widget Elements
        const matchWidget = document.getElementById('matchmaking-status');
        const cancelBtn = document.getElementById('cancel-match-btn');
        const welcomeScreen = document.getElementById('welcome-screen');

        // Note: startMultiplayer usage seems fine as it re-enables welcome-screen logic if needed,
        // but now mpMenu is INSIDE welcome-screen.

        if (mpLocalBtn) {
            mpLocalBtn.onclick = () => {
                console.log("[Game] Local Button Clicked");
                mpMenu.classList.add('hidden');
                try {
                    this.startMultiplayer('local');
                } catch (e) {
                    console.error("[Game] Error starting local multiplayer:", e);
                    alert("Error starting game: " + e.message);
                }
            };
        }

        if (mpOnlineBtn) {
            mpOnlineBtn.onclick = () => {
                console.log("[Game] Online Button Clicked");
                mpMenu.classList.add('hidden');
                try {
                    this.startMultiplayer('online');
                } catch (e) {
                    console.error("[Game] Error starting online multiplayer:", e);
                }
            };
        }

        if (mpBackBtn) {
            mpBackBtn.onclick = () => {
                const modePopup = document.getElementById('mode-select-popup');
                console.log("[Game] Back Button Clicked");
                mpMenu.classList.add('hidden');
                if (modePopup) modePopup.classList.remove('hidden');
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                console.log("[Game] Matchmaking Cancelled by User");
                // 1. Disconnect Network
                if (this.network) {
                    this.network.disconnect();
                }
                // 2. Hide Widget
                if (matchWidget) matchWidget.classList.add('hidden');

                // 3. Reset State
                this.gameStarted = false;
            };
        }
    }

    setupPauseMenu() {
        // Pause Menu Elements
        const pauseMenu = document.getElementById('main-menu'); // Note: ID in HTML is main-menu, confusing but matches
        const resumeBtn = document.getElementById('resume-btn');
        const restartBtn = document.getElementById('restart-btn');
        const levelSelectBtn = document.getElementById('level-select-btn');
        const exitBtn = document.getElementById('exit-btn');
        const hudTop = document.getElementById('hud-top');
        const cardDock = document.getElementById('card-dock');
        const roleBtn = document.getElementById('role-switch-btn');
        const menuBtn = document.getElementById('menu-btn');
        const welcomeScreen = document.getElementById('welcome-screen');
        const appRootMenu = document.getElementById('app-root-menu'); // NEW

        if (resumeBtn) {
            resumeBtn.onclick = () => {
                if (pauseMenu) pauseMenu.classList.add('hidden');
                this.paused = false;
                this.lastTime = performance.now();
                this.loop();
            };
        }

        if (restartBtn) {
            restartBtn.onclick = () => {
                location.reload(); // Simple reload for now
            };
        }

        if (levelSelectBtn) {
            levelSelectBtn.onclick = () => {
                // Exit Game and Show Level Select
                this.gameStarted = false;
                this.paused = true;
                if (pauseMenu) pauseMenu.classList.add('hidden');

                // Hide HUD
                if (hudTop) hudTop.classList.add('hidden');
                if (cardDock) cardDock.classList.add('hidden');
                if (roleBtn) roleBtn.classList.add('hidden');
                if (menuBtn) menuBtn.classList.add('hidden');

                // Show Main Menu & Level Select
                if (welcomeScreen) welcomeScreen.classList.remove('hidden');
                if (appRootMenu) appRootMenu.classList.remove('hidden'); // SHOW NEW MENU
                this.showLevelSelect(); // Re-use existing helper
            };
        }

        if (exitBtn) {
            exitBtn.onclick = () => {
                // Exit logic: Hide everything, Show Main Menu
                this.gameStarted = false;
                this.paused = true;
                if (pauseMenu) pauseMenu.classList.add('hidden');

                // Hide HUD
                if (hudTop) hudTop.classList.add('hidden');
                if (cardDock) cardDock.classList.add('hidden');
                if (roleBtn) roleBtn.classList.add('hidden');
                if (menuBtn) menuBtn.classList.add('hidden');

                // Show Main Menu
                if (welcomeScreen) welcomeScreen.classList.remove('hidden');
                if (appRootMenu) appRootMenu.classList.remove('hidden'); // SHOW NEW MENU

                // Reset to Home State (Close any open modals on the menu)
                const modePopup = document.getElementById('mode-select-popup');
                if (modePopup) modePopup.classList.add('hidden');
            };
        }

    }

    startMultiplayer(mode) {
        // Set Mode
        this.network.mode = mode;
        console.log(`[Game] Starting Multiplayer in ${mode} mode...`);

        // HIDE Popups (Multiplayer/Mode) but KEEP Main Menu Open
        const mpMenu = document.getElementById('multiplayer-menu');
        const modePopup = document.getElementById('mode-select-popup');

        if (mpMenu) mpMenu.classList.add('hidden');
        if (modePopup) modePopup.classList.add('hidden');

        // Show "Top-Right" Waiting Widget
        const matchWidget = document.getElementById('matchmaking-status');
        const matchStatusText = document.getElementById('match-status-text');

        if (matchWidget) {
            matchWidget.classList.remove('hidden');
            if (matchStatusText) matchStatusText.innerText = (mode === 'local') ? "Looking for local opponent..." : "Connecting to server...";
        }

        // Initialize State
        this.initMultiplayer(null, matchStatusText);

        // Connect NOW
        this.network.connect();
    }

    showLevelSelect() {
        // Hide Mode Select, Show Level Select
        const levelScreen = document.getElementById('level-select-screen');
        const modePopup = document.getElementById('mode-select-popup');

        if (modePopup) modePopup.classList.add('hidden');
        if (levelScreen) levelScreen.classList.remove('hidden');
    }


    initCampaign(selectedConfig) {
        this.gamemode = 'campaign';

        // Clear previous game state
        this.state.units = [];
        this.state.towers = [];
        this.state.projectiles = [];
        this.state.time = 0;
        this.enemyBase = null;

        // Reset all tower slots to unoccupied
        this.map.towerSlots.forEach(slot => slot.occupied = false);

        // Reset video sequence to ensure clean state
        this.map.resetVideoSequence();

        const statusText = document.querySelector('#welcome-screen p');
        if (statusText) statusText.innerText = "Waiting for other player to press play...";

        // Broadcast Ready
        // Only send if we are matched/connected, logic handled below
        if (this.network.transport && this.network.transport.isConnected) {
            this.network.sendCommand({ type: CommandType.READY });
        }

        this.checkStartCondition();
        // --- LEVEL SELECTION ---
        // Use passed config
        this.config = selectedConfig || MasterLevelConfig;

        this.role = 'attacker';

        // Initialize AI only if strategy is defined
        if (this.config.aiStrategy) {
            this.ai = new AIDefender(this, this.config);
        } else {
            console.log("[Game] AI Disabled for this level.");
            this.ai = null;
        }

        // Spawn Preset Towers
        if (this.config.presetTowers) {
            this.config.presetTowers.forEach(t => {
                // Determine slot or just place?
                // Snap to known slots if possible, or just exact coords
                // We'll trust config coords for now.
                const tower = new Tower(this, t.x, t.y, t.type);
                this.state.towers.push(tower);

                // Mark slot as occupied if it matches
                const slot = this.map.towerSlots.find(s => Math.abs(s.x - t.x) < 20 && Math.abs(s.y - t.y) < 20);
                if (slot) slot.occupied = true;
            });
        }

        // Set Resources
        this.attackerGold = this.config.startGoldAttacker;
        this.defenderLives = 20; // Used as fallback or visual? With Base, this might be redundant or linked.
        this.defenderGold = this.config.startGoldDefender;

        // SPAWN ENEMY BASE (Castle)
        const pathEnd = this.map.path[this.map.path.length - 1];
        if (pathEnd) {
            this.enemyBase = new Tower(this, pathEnd.x, pathEnd.y, 'base_castle');
            this.state.towers.push(this.enemyBase);
        }

        // UI Labels
        const p1Label = document.querySelector('.player-panel.defender .bar-label');
        const p2Label = document.querySelector('.player-panel.attacker .bar-label');
        if (p1Label) p1Label.innerText = "ENEMY BASE (RED)";
        if (p2Label) p2Label.innerText = "YOU (BLUE)";

        // Start
        this.renderCards(); // Refresh UI for Attacker Role
        this.startGameplay();
    }

    initMultiplayer(btnElement, statusElement) {
        this.gamemode = 'multiplayer';
        this.config = null;
        this.ai = null;

        // Default Multiplayer Resources
        this.attackerGold = 100;
        this.defenderLives = 20;

        // UI Labels Reset
        const p1Label = document.querySelector('.player-panel.defender .bar-label');
        const p2Label = document.querySelector('.player-panel.attacker .bar-label');
        if (p1Label) p1Label.innerText = "P1 DEFENDER (RED)";
        if (p2Label) p2Label.innerText = "P2 ATTACKER (BLUE)";
        // Lobby Logic
        if (this.localReady) return;

        this.localReady = true;

        if (btnElement) {
            btnElement.innerText = "WAITING...";
            btnElement.disabled = true;
            btnElement.style.opacity = "0.5";
        }

        // Hide/Disable other button
        const campaignBtn = document.getElementById('campaign-btn');
        if (campaignBtn) campaignBtn.style.display = 'none';

        if (statusElement) statusElement.innerText = "Waiting for other player...";

        // Broadcast Ready
        this.network.sendCommand({ type: CommandType.READY });

        // Check if we are second to join (opponent already ready)
        this.checkStartCondition();
    }


    // --- Legacy/UI Glue ---
    // (Adapted from old Game.js)

    resize() {
        // Account for high-DPI displays (Retina, modern phones)
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;

        // Set actual canvas size (accounting for pixel ratio)
        this.canvas.width = displayWidth * dpr;
        this.canvas.height = displayHeight * dpr;

        // Set display size (CSS pixels)
        this.canvas.style.width = `${displayWidth}px`;
        this.canvas.style.height = `${displayHeight}px`;

        // CRITICAL: Reset transform before scaling to prevent cumulative scaling
        // Setting canvas width/height already resets the transform, but we do it explicitly for clarity
        this.renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Scale all drawing operations
        this.renderer.ctx.scale(dpr, dpr);

        // Update map with display dimensions (not canvas dimensions)
        if (this.map) this.map.updateDimensions(displayWidth, displayHeight);
    }

    // ... UI Setup methods ...
    // I will copy the basic UI setup but make sure it uses InputManager

    setupUI() {
        this.uiDefenderGold = document.getElementById('defender-gold');
        this.uiDefenderGoldBar = document.querySelector('.player-panel.defender .health-bar .fill'); // Cache Bar

        this.uiGold = document.getElementById('attacker-gold');
        this.uiGoldBar = document.querySelector('.player-panel.attacker .resource-bar .fill'); // Cache Bar
        this.uiDock = document.getElementById('card-dock');
        this.uiSellBtn = document.getElementById('sell-btn');

        if (this.uiSellBtn) {
            this.uiSellBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.audio.playClick();
                this.input.triggerSell(); // Trigger via InputManager
            });
        }

        // Manual Role Switch REMOVED - Handled by Network
        // But for Campaign we want to Ensure it's hidden or disabled
        if (this.gamemode === 'campaign') {
            const roleBtn = document.getElementById('role-switch-btn');
            if (roleBtn) roleBtn.style.display = 'none';
        }

        this.renderCards();
    }

    updateUI() {
        // if (this.uiLives) this.uiLives.innerText = Math.floor(this.state.lives); // Deprecated for Campaign
        if (this.gamemode === 'campaign') {
            // Defender Gold
            if (this.uiDefenderGold) this.uiDefenderGold.innerText = Math.floor(this.defenderGold);
            if (this.uiDefenderGoldBar && this.config) {
                const pct = Math.max(0, (this.defenderGold / this.config.startGoldDefender) * 100);
                this.uiDefenderGoldBar.style.width = `${pct}%`;
            }

            // Attacker Gold UI logic
            if (this.uiGold) this.uiGold.innerText = Math.floor(this.attackerGold);
            if (this.uiGoldBar && this.config) {
                const pct = Math.max(0, (this.attackerGold / this.config.startGoldAttacker) * 100);
                this.uiGoldBar.style.width = `${pct}%`;
            }
        } else {
            if (this.uiGold) this.uiGold.innerText = Math.floor(this.state.gold);
        }

        // Update Sell Button Position
        // Update Sell Button Position
        if (this.input.selectedEntity && this.uiSellBtn && this.renderer && this.role !== 'attacker') {
            // Need screen coordinates. Renderer/Map knows?
            // Map knows.
            const entity = this.input.selectedEntity;

            // Calculate Screen Coordinates using Map logic
            // (x * scale) + offsetX
            const screenX = (entity.x * this.map.scale) + this.map.offsetX;
            const screenY = (entity.y * this.map.scale) + this.map.offsetY;

            // console.log(`[UI] Show Sell Btn at ${screenX}, ${screenY}`); // Spammy

            this.uiSellBtn.style.display = 'flex';
            this.uiSellBtn.style.left = `${screenX + 30}px`; // Offset to right
            this.uiSellBtn.style.top = `${screenY - 30}px`;  // Offset up
        } else if (this.uiSellBtn) {
            this.uiSellBtn.style.display = 'none';
        }

        // Update Cooldown Visuals (Attacker)
        if (this.role === 'attacker' && this.uiDock) {
            const now = performance.now();
            const remaining = Math.max(0, this.attackerNextSpawnTime - now);
            const cards = this.uiDock.querySelectorAll('.card');

            cards.forEach(card => {
                if (card.dataset.id && card.dataset.id.startsWith('unit')) {
                    const overlay = card.querySelector('.cooldown-overlay');
                    if (remaining > 0) {
                        card.classList.add('cooldown-active');
                        if (overlay) {
                            overlay.classList.remove('hidden');
                            // Show 0.X or just Seconds? "1s" then empty?
                            // User asked for "countdown timer". 1.0s is short.
                            // Maybe shows "1" 
                            overlay.innerText = (remaining / 1000).toFixed(1);
                        }
                    } else {
                        card.classList.remove('cooldown-active');
                        if (overlay) overlay.classList.add('hidden');
                    }
                }
            });
        }
    }

    toggleRole() {
        this.role = (this.role === 'attacker') ? 'defender' : 'attacker';
        this.input.selectedCard = null; // Update InputManager state
        this.renderCards();
    }

    renderCards() {
        // ... (Same as old Game.js but setting input.selectedCard)
        this.uiDock.innerHTML = '';
        this.uiDock.className = `${this.role}-theme`;

        // Cooldown Overlay Logic (could be refined later)
        const cooldownActive = (performance.now() < this.attackerNextSpawnTime);

        // Get Deck for Units
        const deckUnits = this.deckManager.getCurrentDeckObjects();

        const towers = [
            { id: 'tower_tesla', label: 'Tesla', img: 'tower_tesla.png', cost: TowerCosts['tower_tesla'] },
            { id: 'tower_crystal', label: 'Crystal', img: 'assets/towers/CrystalTower/Gemini_Generated_Image_ekb5v6ekb5v6ekb5.png', cost: TowerCosts['tower_crystal'] }
        ];

        // Combine based on role?
        // Actually, if we are ATTACKER, we only show deckUnits.
        // If we are DEFENDER, we only show towers.
        // But for local testing "Simultaneous", we might want both?
        // The original code merged them. Let's keep merging for now but replace 'units' with deckUnits.

        const items = [...deckUnits, ...towers];

        // Filter for Campaign
        const filteredItems = (this.gamemode === 'campaign')
            ? items.filter(i => {
                if (this.role === 'attacker') return this.config.allowedUnits.includes(i.id);
                return this.config.allowedTowers.includes(i.id);
            })
            : items;

        filteredItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.id = item.id; // Store ID for UI updates

            // Show Cost in Label + Cooldown Overlay
            card.innerHTML = `
                <img src="${item.img}" class="card-icon-img">
                <span>${item.label} (${item.cost})</span>
                <div class="cooldown-overlay hidden"></div>
            `;

            card.onclick = () => {
                // INSTANT SPAWN for Units (Any Role for Co-op/Simultaneous)
                if (item.id.startsWith('unit')) {
                    // Check Cooldown FIRST
                    const now = performance.now();
                    // We stick to 'attackerNextSpawnTime' as a global cooldown for the local player
                    if (now < this.attackerNextSpawnTime) {
                        return; // Silent fail (visuals handled by updateUI)
                    }

                    // Cost Check
                    if (this.attackerGold < item.cost) {
                        this.audio.playClick(); // Play click for failure? Or error sound? keeping click for now.
                        // Visual feedback for too expensive
                        card.style.borderColor = "red";
                        setTimeout(() => card.style.borderColor = "", 200);
                        return;
                    }

                    this.audio.playClick(); // Successful Click

                    const cmd = {
                        type: CommandType.SPAWN_UNIT,
                        unitType: item.id,
                        role: this.role // CRITICAL: Tell everyone who spawned this (for path direction)
                    };
                    this.network.sendCommand(cmd);

                    // Deduct Gold
                    this.attackerGold -= item.cost;
                    this.updateUI();

                    // Set Cooldown (1 Second)
                    this.attackerNextSpawnTime = now + 1000;

                    // Visual feedback (Success)
                    card.style.transform = "scale(0.9)";
                    setTimeout(() => card.style.transform = "", 100);
                    return;
                }

                // Default Select Logic (Defender/Towers)
                this.selectCard(item.id, card);
            };
            this.uiDock.appendChild(card);
        });
    }

    selectCard(id, element) {
        // UI Selection Visuals
        const prev = document.querySelector('.card.selected');
        if (prev) prev.classList.remove('selected');

        if (this.input.selectedCard === id) {
            this.input.selectedCard = null;
        } else {
            this.input.selectedCard = id;
            element.classList.add('selected');
        }
    }

    setupMenu() {
        // ... (Pause/Resume logic) ... 
        this.uiMenu = document.getElementById('main-menu');
        const resumeBtn = document.getElementById('resume-btn');
        const menuTrigger = document.getElementById('menu-btn');

        const toggle = () => {
            this.paused = !this.paused;
            if (this.paused) this.uiMenu.classList.remove('hidden');
            else this.uiMenu.classList.add('hidden');
        };

        if (menuTrigger) menuTrigger.addEventListener('click', toggle);
        if (resumeBtn) resumeBtn.addEventListener('click', toggle);

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') toggle();
        });
    }

    // --- Deck UI Management ---
    openDeckScreen(mode = 'units') {
        const deckScreen = document.getElementById('deck-screen');
        const closeBtn = document.getElementById('deck-back-btn');
        const presetBtns = document.querySelectorAll('.preset-btn');

        if (!deckScreen) return;

        // Set Mode
        this.deckManager.setMode(mode);

        // Show Screen
        deckScreen.classList.remove('hidden');

        // Close Handler
        closeBtn.onclick = () => {
            deckScreen.classList.add('hidden');
            this.renderCards(); // Refresh main game dock with new deck
        };

        // Preset Handlers
        presetBtns.forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.preset);
                this.deckManager.setPreset(idx);

                // Update Buttons
                presetBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                this.renderDeckUI();
            };
        });

        // Initialize UI
        // Update Active Preset Button
        presetBtns.forEach(b => b.classList.remove('active'));
        presetBtns[this.deckManager.currentPresetIndex].classList.add('active');

        this.renderDeckUI();
    }

    renderDeckUI() {
        const deckSlots = document.getElementById('deck-slots');
        const unitPool = document.getElementById('unit-pool');

        if (!deckSlots || !unitPool) return;

        // Clear Current
        deckSlots.innerHTML = '';
        unitPool.innerHTML = '';

        // Check Mode
        const mode = this.deckManager.mode; // 'units' or 'towers'
        // Update Title if needed (Optional: UI Text update)
        const headerTitle = document.querySelector('.deck-header h2');
        if (headerTitle) {
            headerTitle.innerText = (mode === 'units') ? "MANAGE ARMY" : "MANAGE DEFENSE";
        }

        // Update Section Titles
        const poolTitle = document.querySelector('.unit-pool-section h3');
        if (poolTitle) {
            poolTitle.innerText = (mode === 'units') ? "AVAILABLE UNITS" : "AVAILABLE TOWERS";
        }

        const currentDeck = this.deckManager.getCurrentDeckObjects();
        const allItems = this.deckManager.getAllItems(); // Generic call

        // 1. Render Current Deck (Max 6)
        // We render 6 slots, filled or empty
        for (let i = 0; i < 6; i++) {
            let slotElement;
            if (i < currentDeck.length) {
                const item = currentDeck[i];
                slotElement = this.createDeckCard(item, true); // Generic Variable
            } else {
                slotElement = document.createElement('div');
                slotElement.className = 'empty-slot';
                slotElement.innerText = '+';
            }

            // Drag Handlers for Drop Logic (Add to Deck)
            slotElement.ondragover = (e) => {
                e.preventDefault(); // Allow drop
                slotElement.classList.add('drag-over');
                e.dataTransfer.dropEffect = "copy";
            };
            slotElement.ondragleave = (e) => {
                slotElement.classList.remove('drag-over');
            };
            slotElement.ondrop = (e) => {
                e.preventDefault();
                slotElement.classList.remove('drag-over');
                const unitId = e.dataTransfer.getData('text/plain');
                if (unitId) {
                    const success = this.deckManager.addToDeck(unitId);
                    if (success) {
                        this.audio.playClick();
                        this.renderDeckUI();
                    }
                }
            };

            deckSlots.appendChild(slotElement);
        }

        // 2. Render Pool (Exclude ones in deck?)
        // Or show them as disabled/selected? 
        // Let's show all, but maybe dim ones in deck, or just allow toggling.

        allItems.forEach(item => {
            const inDeck = this.deckManager.isInDeck(item.id);
            const card = this.createDeckCard(item, false);

            if (inDeck) {
                card.style.opacity = "0.5";
                card.style.filter = "grayscale(1)";
                card.style.cursor = "default";
                card.draggable = false; // Cannot drag if already in deck (from pool view)
                card.onclick = null;
            } else {
                card.onclick = () => {
                    const success = this.deckManager.addToDeck(item.id);
                    if (success) {
                        this.audio.playClick();
                        this.renderDeckUI();
                    }
                };
            }
            unitPool.appendChild(card);
        });

        // 3. Setup Drop Zone on Unit Pool (For Removing)
        unitPool.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        };
        unitPool.ondrop = (e) => {
            e.preventDefault();
            const itemId = e.dataTransfer.getData('text/plain');
            // Basic validation: Check if ID exists in deck before removing (DeckManager handles it, but check mode?)
            // Ideally, we shouldn't cross-drop (unit to tower deck). 
            // If IDs are distinct, it won't be in deck anyway.
            if (this.deckManager.removeFromDeck(itemId)) {
                this.audio.playClick();
                this.renderDeckUI();
            }
        };
    }

    createDeckCard(unit, isDeckSlot) {
        const card = document.createElement('div');
        card.className = 'deck-card';
        card.draggable = true; // Enable Drag

        card.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', unit.id);
            // Optional: Set drag image or allow default
            card.style.opacity = '0.5';
        };

        card.ondragend = (e) => {
            card.style.opacity = '1';
        };
        card.innerHTML = `
            <img src="${unit.img}">
            <span>${unit.label}</span>
            <div class="cost-badge">${unit.cost}</div>
        `;

        if (isDeckSlot) {
            card.onclick = () => {
                this.deckManager.removeFromDeck(unit.id);
                this.audio.playClick();
                this.renderDeckUI();
            };
        }

        return card;
    }
}
