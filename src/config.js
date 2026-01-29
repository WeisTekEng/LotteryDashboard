const path = require('path');
const fs = require('fs');

const DEFAULT_CONFIG = {
    PORTS: {
        UDP: 33333,
        HTTP: 3000
    },
    FILES: {
        MINERS: path.join(__dirname, '..', 'data', 'miners.json'),
        HISTORY: path.join(__dirname, '..', 'data', 'history.json'),
        AUTOTUNE: path.join(__dirname, '..', 'data', 'autotune_state.json'),
        OVERRIDE: path.join(__dirname, '..', 'data', 'config.json')
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
            adjustInterval: 60000,
            tempTarget: 62,
            tempWarning: 67,
            tempDanger: 72,
            targetEfficiency: 16,
            maxErrorRate: 0.05,
            recoveryVoltage: 1150,
            recoveryFreq: 500,
            maxVrTemp: 85,
            minInputVolts: 4800,
            maxInputVolts: 5600,
            maxWatts: 40
        },
        aggressive: {
            minVoltage: 1150,
            maxVoltage: 1380,
            minFreq: 675,
            maxFreq: 1200,
            voltageStep: 15,
            freqStep: 10,
            adjustInterval: 30000,
            tempTarget: 71,
            tempWarning: 72,
            tempDanger: 73,
            targetEfficiency: null,
            maxErrorRate: 0.25,
            recoveryVoltage: 1150,
            recoveryFreq: 800,
            maxVrTemp: 86,
            minInputVolts: 4800,
            maxInputVolts: 5600,
            maxWatts: 45
        }
    }
};

let CONFIG = { ...DEFAULT_CONFIG };

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Load overrides if they exist, otherwise create a template
if (!fs.existsSync(DEFAULT_CONFIG.FILES.OVERRIDE)) {
    try {
        const template = {
            PORTS: DEFAULT_CONFIG.PORTS,
            LIMITS: DEFAULT_CONFIG.LIMITS,
            AUTOTUNE: DEFAULT_CONFIG.AUTOTUNE
        };
        fs.writeFileSync(DEFAULT_CONFIG.FILES.OVERRIDE, JSON.stringify(template, null, 2));
        console.log('[Config] Created default config.json template in data directory');
    } catch (e) {
        console.error('[Config] Failed to create default config.json template:', e.message);
    }
} else {
    try {
        const overrides = JSON.parse(fs.readFileSync(DEFAULT_CONFIG.FILES.OVERRIDE, 'utf8'));

        const merge = (target, source) => {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    target[key] = merge(target[key] || {}, source[key]);
                } else {
                    target[key] = source[key];
                }
            }
            return target;
        };

        const { FILES, ...cleanOverrides } = overrides;
        CONFIG = merge(CONFIG, cleanOverrides);
        console.log('[Config] Loaded external configuration overrides from data/config.json');
    } catch (e) {
        console.error('[Config] Failed to load config.json overrides:', e.message);
    }
}

module.exports = CONFIG;
