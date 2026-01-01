
export class DeckManager {
    constructor() {
        this.STORAGE_KEY_UNITS = 'tower_attack_deck_data';
        this.STORAGE_KEY_TOWERS = 'tower_attack_deck_data_towers';

        // Define all available units
        this.allUnits = [
            { id: 'unit_basic', label: 'Grunt', img: 'assets/units/soldier/Main_soldier.png', cost: 10, description: "Basic infantry unit." },
            { id: 'unit_tank', label: 'Tank', img: 'assets/units/unit_tank.png', cost: 30, description: "Heavily armored unit." },
            { id: 'unit_crawler', label: 'Crawler', img: 'assets/units/soldier/Main_soldier.png', cost: 15, description: "Fast unit that ignores paths." },
            { id: 'unit_spider', label: 'Spider', img: 'assets/units/Spider/spider_walk_01.png', cost: 20, description: "Disables and drains towers." },
            { id: 'unit_saber_rider', label: 'Rider', img: 'assets/units/saber_rider.png', cost: 50, description: "Fast attacker that shoots while moving." },
            { id: 'unit_golem', label: 'Golem', img: 'unit_golem.png', cost: 60, description: "Slow siege unit that targets towers." },
            { id: 'unit_mecha_dino', label: 'Dino', img: 'assets/units/mecha_dino/mecha_dino.png', cost: 100, description: "Powerful mechanical beast." }
        ];

        // Define all available towers
        this.allTowers = [
            { id: 'tower_cannon', label: 'Cannon', img: 'assets/towers/Main_tower.png', cost: 100, description: "Standard defense tower." },
            { id: 'tower_mage', label: 'Mage', img: 'assets/towers/tower_mage.png', cost: 150, description: "Fires magic projectiles." },
            { id: 'tower_tesla', label: 'Tesla', img: 'tower_tesla.png', cost: 200, description: "Chain lightning attack." },
            { id: 'tower_pulse_cannon', label: 'Pulse', img: 'assets/towers/PulseCannon/pulse_cannon.png', cost: 300, description: "High damage area of effect." },
            { id: 'tower_barracks', label: 'Barracks', img: 'assets/towers/Barracks/barracks.png', cost: 120, description: "Spawns defensive units." },
            { id: 'tower_ice', label: 'Ice', img: 'assets/towers/IceTower/ice_tower.png', cost: 180, description: "Slows enemies." },
            { id: 'tower_crystal', label: 'Crystal', img: 'assets/towers/CrystalTower/Gemini_Generated_Image_ekb5v6ekb5v6ekb5.png', cost: 400, description: "Powerful long range laser." }
        ];

        // Default Presets
        this.defaultUnitPresets = [
            ['unit_basic', 'unit_tank', 'unit_crawler'],
            ['unit_basic', 'unit_saber_rider', 'unit_golem'],
            ['unit_spider', 'unit_mecha_dino', 'unit_tank']
        ];

        this.defaultTowerPresets = [
            ['tower_cannon', 'tower_mage', 'tower_tesla'],
            ['tower_cannon', 'tower_ice', 'tower_crystal'],
            ['tower_pulse_cannon', 'tower_barracks', 'tower_mage']
        ];

        this.currentPresetIndex = 0;
        this.unitPresets = this.loadData(this.STORAGE_KEY_UNITS, this.defaultUnitPresets);
        this.towerPresets = this.loadData(this.STORAGE_KEY_TOWERS, this.defaultTowerPresets);

        // Internal MODE state ('units' or 'towers')
        this.mode = 'units';
    }

    setMode(mode) {
        if (mode === 'units' || mode === 'towers') {
            this.mode = mode;
        }
    }

    loadData(key, defaults) {
        const stored = localStorage.getItem(key);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (Array.isArray(data) && data.length === 3) {
                    return data;
                }
            } catch (e) {
                console.error(`Failed to load data for ${key}`, e);
            }
        }
        return JSON.parse(JSON.stringify(defaults));
    }

    saveData() {
        if (this.mode === 'units') {
            localStorage.setItem(this.STORAGE_KEY_UNITS, JSON.stringify(this.unitPresets));
        } else {
            localStorage.setItem(this.STORAGE_KEY_TOWERS, JSON.stringify(this.towerPresets));
        }
    }

    getAllItems() {
        return (this.mode === 'units') ? this.allUnits : this.allTowers;
    }

    getAllUnits() { return this.allUnits; } // Legacy/Specific access

    getCurrentDeckIds() {
        const presets = (this.mode === 'units') ? this.unitPresets : this.towerPresets;
        return presets[this.currentPresetIndex];
    }

    getCurrentDeckObjects() {
        const ids = this.getCurrentDeckIds();
        const pool = this.getAllItems();
        return ids.map(id => pool.find(item => item.id === id)).filter(item => item);
    }

    setPreset(index) {
        if (index >= 0 && index < 3) {
            this.currentPresetIndex = index;
        }
    }

    addToDeck(itemId) {
        const currentDeck = this.getCurrentDeckIds();
        if (currentDeck.length >= 6) {
            return false; // Deck full
        }
        if (currentDeck.includes(itemId)) {
            return false; // Already in deck
        }
        currentDeck.push(itemId);
        this.saveData();
        return true;
    }

    removeFromDeck(itemId) {
        const currentDeck = this.getCurrentDeckIds();
        const index = currentDeck.indexOf(itemId);
        if (index > -1) {
            currentDeck.splice(index, 1);
            this.saveData();
            return true;
        }
        return false;
    }

    isInDeck(itemId) {
        return this.getCurrentDeckIds().includes(itemId);
    }

    // Alias for legacy call
    isUnitInDeck(unitId) {
        // Force mode check or just scan both? Current usage is only in UI where mode matters.
        // But renderDeckUI uses it. Let's redirect to standard.
        return this.isInDeck(unitId);
    }
}
