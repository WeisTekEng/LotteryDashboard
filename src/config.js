const path = require('path');

const CONFIG = {
    PORTS: {
        UDP: 33333,
        HTTP: 3000
    },
    FILES: {
        MINERS: path.join(__dirname, '..', 'miners.json'),
        HISTORY: path.join(__dirname, '..', 'history.json'),
        AUTOTUNE: path.join(__dirname, '..', 'autotune_state.json')
    },
    LIMITS: {
        MAX_HISTORY: 1440, // 24 hours
        MINER_TIMEOUT: 30000, // 30 seconds
        SCAN_INTERVAL: 120000, // 2 minutes
        POLL_INTERVAL: 5000, // 5 seconds
        AUTOTUNE_LOOP_INTERVAL: 10000, // 10 seconds
        STATS_FETCH_INTERVAL: 60000 // 60 seconds
    },
    AUTOTUNE: {
        conservative: {
            minVoltage: 1150,
            maxVoltage: 1250,
            minFreq: 450,
            maxFreq: 575,
            voltageStep: 10,
            freqStep: 10,
            adjustInterval: 60000, // 60 seconds
            tempTarget: 62,
            tempWarning: 67,
            tempDanger: 72,
            targetEfficiency: 16, // J/TH target
            maxErrorRate: 0.05, // 5% error rate threshold
            recoveryVoltage: 1150,
            recoveryFreq: 500,
            maxVrTemp: 85,
            minInputVolts: 4800,
            maxInputVolts: 5600,
            maxWatts: 40
        },
        aggressive: {
            minVoltage: 1150,
            maxVoltage: 1400,
            minFreq: 450,
            maxFreq: 1200,
            voltageStep: 15,
            freqStep: 10,
            adjustInterval: 30000, // 30 seconds
            tempTarget: 71,
            tempWarning: 72,
            tempDanger: 73,
            targetEfficiency: null, // No efficiency target for aggressive
            maxErrorRate: 0.25, // 8% error rate threshold (more tolerant)
            recoveryVoltage: 1150,
            recoveryFreq: 800,
            maxVrTemp: 86,
            minInputVolts: 4800,
            maxInputVolts: 5600,
            maxWatts: 45
        }
    }
};

module.exports = CONFIG;
