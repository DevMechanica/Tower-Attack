export const Level1Config = {
    name: "Campaign Level 1",
    startGoldAttacker: 100,
    startGoldDefender: 150,
    allowedUnits: ['unit_basic', 'unit_archer', 'unit_spider'],
    allowedTowers: ['tower_tesla', 'tower_crystal'],
    aiStrategy: 'basic_expansion',
    winCondition: {
        type: 'destroy_all',
        description: "Destroy all enemy towers!"
    },
    lossCondition: {
        type: 'attrition',
        description: "Run out of gold and units."
    }
};
