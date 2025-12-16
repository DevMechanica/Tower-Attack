export const MasterLevelConfig = {
    name: "Master Test Level",
    startGoldAttacker: 5000, // Rich start for testing
    startGoldDefender: 5000,
    allowedUnits: ['unit_basic', 'unit_tank', 'unit_golem', 'unit_mecha_dino', 'unit_saber_rider'],
    allowedTowers: ['tower_cannon', 'tower_mage', 'tower_tesla'],
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
