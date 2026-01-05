
export class DeckManager {
    constructor() {
        this.STORAGE_KEY_UNITS = 'tower_attack_deck_data_v2';
        this.STORAGE_KEY_TOWERS = 'tower_attack_deck_data_towers';

        // Define all available units
        this.allUnits = [
            { id: 'unit_basic', label: 'Grunt', img: 'assets/units/soldier/Main_soldier.png', cost: 10, description: "Basic infantry unit." },
            { id: 'unit_archer', label: 'Archer', img: 'assets/units/Archer/main_look.png', cost: 15, description: "Ranged unit." },
            { id: 'unit_spider', label: 'Spider', img: 'assets/units/Spider/spider_walk_01.png', cost: 20, description: "Disables and drains towers." }
        ];

        // Define all available towers
        this.allTowers = [

            { id: 'tower_tesla', label: 'Tesla', img: 'tower_tesla.png', cost: 200, description: "Chain lightning attack." },
            { id: 'tower_crystal', label: 'Crystal', img: 'assets/towers/CrystalTower/Gemini_Generated_Image_ekb5v6ekb5v6ekb5.png', cost: 400, description: "Powerful long range laser." }
        ];

        // Default Presets
        this.defaultUnitPresets = [
            ['unit_basic', 'unit_archer'],
            ['unit_spider', 'unit_basic'],
            ['unit_basic', 'unit_basic']
        ];

        this.defaultTowerPresets = [
            ['tower_tesla', 'tower_crystal'],
            ['tower_crystal', 'tower_tesla'],
            ['tower_tesla', 'tower_tesla']
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
