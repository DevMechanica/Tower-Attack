export const PresetLevelConfig = {
    name: "Static Defense Level 1",
    startGoldAttacker: 200,
    startGoldDefender: 0, // Not used
    allowedUnits: ['unit_basic', 'unit_tank'],
    allowedTowers: [], // Player doesn't see these anyway
    aiStrategy: null, // DISABLE AI

    // Static Tower Placement
    presetTowers: [
        { x: 486, y: 532, type: 'tower_cannon' },
        { x: 726, y: 334, type: 'tower_cannon' },
        { x: 840, y: 339, type: 'tower_mage' }
    ],

    winCondition: {
        type: 'destroy_base',
        description: "Destroy the Enemy Base!"
    },
    lossCondition: {
        type: 'attrition',
        description: "Run out of resources."
    }
};
