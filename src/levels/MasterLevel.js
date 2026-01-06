export const MasterLevelConfig = {
    name: "Master Test Level",
    startGoldAttacker: 5000, // Rich start for testing
    startGoldDefender: 5000,
    allowedUnits: ['unit_basic', 'unit_archer', 'unit_spider'],
    allowedTowers: ['tower_tesla', 'tower_crystal', 'tower_ivy'],
    aiStrategy: 'random_pressure',
    winCondition: {
        type: 'destroy_base',
        description: "Destroy the Enemy Command Center!"
    },
    lossCondition: {
        type: 'attrition',
        description: "Run out of resources."
    }
};
