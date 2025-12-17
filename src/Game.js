
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
        this.setupWelcome();

        // Initial Resize
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Right Click Cancel
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.deselectAll();
        });
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
                this.defenderLives = Math.max(0, this.enemyBase.health / 100); // Scale 2000 -> 20 for UI? Or just show raw? 
                // Let's show raw percentage or simplified.
                // Actually UI expects a small number (20). 2000 is too big.
                // Let's map 2000 -> 20.
                this.state.lives = (this.enemyBase.health / this.enemyBase.maxHealth) * 20;

                if (!this.enemyBase.active) {
                    this.endGame(true, "VICTORY! The Enemy Base is Destroyed!");
                }
            } else if (this.state.time > 3000 && this.state.towers.length === 0) {
                // Fallback if no base exists (legacy/other levels)
                this.endGame(true, "VICTORY! All towers destroyed.");
            }

            // Loss Condition: Run out of gold and units
            // And can't afford cheapest unit
            if (this.state.units.length === 0 && this.attackerGold < 10) { // Assuming 10 is cheapest unit or similar
                this.endGame(false, "DEFEAT! Out of resources.");
            }
        }
    }

    endGame(victory, message) {
        alert(message); // Simple placeholder
        this.paused = true;
        this.gameStarted = false;
        location.reload(); // Simple restart
    }



    render(timestamp) {
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
                // Ensure we have enough gold?
                // Logic says: if (this.attackerGold >= cost) ...
                // Let's assume unlimited or check cost.
                // For MVP: Just spawn.
                this.state.units.push(UnitFactory.createUnit(this, this.map.path, cmd.unitType));
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

        if (welcomeScreen) welcomeScreen.classList.add('hidden');
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

        // Campaign Handler
        if (campaignBtn) {
            campaignBtn.addEventListener('click', () => {
                this.showLevelSelect();
            });
        }

        this.setupLevelSelect();

        // Multiplayer Handler
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
                levelScreen.classList.add('hidden');
                welcomeScreen.classList.remove('hidden');
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
        const welcomeScreen = document.getElementById('welcome-screen');
        const mpMenu = document.getElementById('multiplayer-menu');
        if (welcomeScreen) welcomeScreen.classList.add('hidden');
        if (mpMenu) mpMenu.classList.remove('hidden');
    }

    setupMultiplayerMenu() {
        const mpLocalBtn = document.getElementById('mp-local-btn');
        const mpOnlineBtn = document.getElementById('mp-online-btn');
        const mpBackBtn = document.getElementById('mp-back-btn');
        const welcomeScreen = document.getElementById('welcome-screen');
        const mpMenu = document.getElementById('multiplayer-menu');

        if (mpLocalBtn) {
            mpLocalBtn.onclick = () => {
                console.log("[Game] Local Button Clicked");
                mpMenu.classList.add('hidden');
                try {
                    this.startMultiplayer('local');
                } catch (e) {
                    console.error("[Game] Error starting local multiplayer:", e);
                    // Show error on screen?
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
                console.log("[Game] Back Button Clicked");
                mpMenu.classList.add('hidden');
                welcomeScreen.classList.remove('hidden');
            };
        }
    }

    startMultiplayer(mode) {
        // Set Mode
        this.network.mode = mode;
        console.log(`[Game] Starting Multiplayer in ${mode} mode...`);

        const statusText = document.querySelector('#welcome-screen p');
        const welcomeScreen = document.getElementById('welcome-screen');
        welcomeScreen.classList.remove('hidden'); // Show it back to show status

        // Update UI to "Connecting/Waiting"
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.innerText = "CONNECTING...";
            startBtn.disabled = true;
        }

        // Initialize State FIRST (sets localReady = true)
        // Note: this will attempt to send READY, but transport might be null yet. 
        // That is fine, NetworkManager.sendCommand handles null transport safely.
        // The important part is setting localReady = true so onRoleAssigned works.
        this.initMultiplayer(startBtn, statusText);

        // Connect NOW
        this.network.connect();
    }

    showLevelSelect() {
        const welcomeScreen = document.getElementById('welcome-screen');
        const levelScreen = document.getElementById('level-select-screen');
        if (welcomeScreen) welcomeScreen.classList.add('hidden');
        if (levelScreen) levelScreen.classList.remove('hidden');
    }


    initCampaign(selectedConfig) {
        this.gamemode = 'campaign';

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
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.map) this.map.updateDimensions(this.canvas.width, this.canvas.height);
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
        if (this.input.selectedEntity && this.uiSellBtn && this.renderer) {
            // Need screen coordinates. Renderer/Map knows?
            // Map knows.
            const entity = this.input.selectedEntity;

            // Calculate Screen Coordinates using Map logic
            // (x * scale) + offsetX
            const screenX = (entity.x * this.map.scale) + this.map.offsetX;
            const screenY = (entity.y * this.map.scale) + this.map.offsetY;

            console.log(`[UI] Show Sell Btn at ${screenX}, ${screenY}`);

            this.uiSellBtn.style.display = 'flex';
            this.uiSellBtn.style.left = `${screenX + 30}px`; // Offset to right
            this.uiSellBtn.style.top = `${screenY - 30}px`;  // Offset up
        } else if (this.uiSellBtn) {
            this.uiSellBtn.style.display = 'none';
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

        const items = (this.role === 'attacker')
            ? [
                { id: 'unit_basic', label: 'Grunt', img: 'assets/units/soldier/Main_soldier.png', cost: 10 },
                { id: 'unit_tank', label: 'Tank', img: 'assets/units/unit_tank.png', cost: 30 },
                { id: 'unit_golem', label: 'Golem', img: 'unit_golem.png', cost: 60 },
                { id: 'unit_mecha_dino', label: 'Dino', img: 'assets/units/mecha_dino/mecha_dino.png', cost: 100 },
                { id: 'unit_saber_rider', label: 'Rider', img: 'assets/units/saber_rider.png', cost: 50 },
                { id: 'unit_crawler', label: 'Crawler', img: 'assets/units/soldier/Main_soldier.png', cost: 15 }
            ]
            : [
                { id: 'tower_cannon', label: 'Cannon', img: 'assets/towers/Main_tower.png', cost: TowerCosts['tower_cannon'] },
                { id: 'tower_mage', label: 'Mage', img: 'assets/towers/tower_mage.png', cost: TowerCosts['tower_mage'] },
                { id: 'tower_tesla', label: 'Tesla', img: 'tower_tesla.png', cost: TowerCosts['tower_tesla'] }
            ];

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
            // Show Cost in Label
            card.innerHTML = `<img src="${item.img}" class="card-icon-img"><span>${item.label} (${item.cost})</span>`;

            card.onclick = () => {
                this.audio.playClick();

                // INSTANT SPAWN for Attacker (Units)
                if (this.role === 'attacker' && item.id.startsWith('unit')) {
                    // Cost Check
                    if (this.attackerGold < item.cost) {
                        // Visual feedback for too expensive
                        card.style.borderColor = "red";
                        setTimeout(() => card.style.borderColor = "", 200);
                        return;
                    }

                    const cmd = {
                        type: CommandType.SPAWN_UNIT,
                        unitType: item.id
                    };
                    this.network.sendCommand(cmd);

                    // Deduct Gold
                    this.attackerGold -= item.cost;
                    this.updateUI();

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
}
