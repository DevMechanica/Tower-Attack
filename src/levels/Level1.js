export const Level1Config = {
    name: "Campaign Level 1",
    startGoldAttacker: 100,
    startGoldDefender: 150,
    allowedUnits: ['unit_basic'],
    allowedTowers: ['tower_cannon'],
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
