const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');

// Ensure data directory exists
const dataDir = path.dirname(CONFIG.FILES.MINERS);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

class StorageService {
    static loadMiners() {
        if (fs.existsSync(CONFIG.FILES.MINERS)) {
            try {
                const data = JSON.parse(fs.readFileSync(CONFIG.FILES.MINERS, 'utf8'));
                const httpMiners = new Map();
                data.forEach(m => {
                    const meta = { name: m.name || 'Bitaxe', coin: m.coin || 'BTC' };
                    if (m.fallbackCoin) meta.fallbackCoin = m.fallbackCoin;
                    httpMiners.set(m.ip, meta);
                });
                return httpMiners;
            } catch (e) {
                console.error('Failed to load miners.json:', e);
            }
        }
        return new Map();
    }

    static saveMiners(httpMiners) {
        try {
            const data = Array.from(httpMiners.entries()).map(([ip, val]) => {
                const meta = (typeof val === 'string') ? { name: val, coin: 'BTC' } : val;
                const entry = { ip, name: meta.name, coin: meta.coin };
                if (meta.fallbackCoin) entry.fallbackCoin = meta.fallbackCoin;
                return entry;
            });
            fs.writeFileSync(CONFIG.FILES.MINERS, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save miners:', e);
        }
    }

    static loadAutoTuneState() {
        const autoTuneStates = new Map();
        if (fs.existsSync(CONFIG.FILES.AUTOTUNE)) {
            try {
                const data = JSON.parse(fs.readFileSync(CONFIG.FILES.AUTOTUNE, 'utf8'));
                data.forEach(item => {
                    autoTuneStates.set(item.ip, {
                        minerType: item.minerType || 'bitaxe',                      // what type of miner is this
                        enabled: item.enabled,                                      // is auto-tune enabled.
                        mode: item.mode,                                            // what mode is auto-tune set too
                        kwhPrice: item.kwhPrice || null,                            // what is the cost of electricity
                        dailyCostLimit: item.dailyCostLimit || null,                // what is the daily cost limit
                        lastAdjustment: 0,                                          // when was the last adjustment
                        tempHistory: [],                                            // history of temperatures
                        currentVoltage: item.currentVoltage,                        // current voltage
                        currentFreq: item.currentFreq,                              // current frequency
                        lastShares: item.lastShares || { valid: 0, invalid: 0 },    // last shares
                        lastErrorCount: item.lastErrorCount || 0,                   // last error count
                        errorHistory: item.errorHistory || [],                      // history of errors
                        stableCycleCount: item.stableCycleCount || 0,               // stable cycle count
                        lastAction: item.lastAction || 'maintain',                  // last action
                        lastGoodVoltage: item.lastGoodVoltage || null,              // last good voltage
                        lastGoodFreq: item.lastGoodFreq || null,                    // last good frequency
                        faultCounter: item.faultCounter || 0,                       // fault counter
                        faultHistory: item.faultHistory || [],                      // history of faults
                        adaptiveLimits: item.adaptiveLimits || null,                // adaptive limits
                        tuningLog: item.tuningLog || [],                            // tuning log
                        gridHistory: item.gridHistory || {},                        // grid history
                        stabilizationUntil: 0,                                      // when was the last adjustment
                        restarting: false                                           // is auto-tune restarting
                    });
                });
                console.log(`Loaded auto-tune state for ${data.length} miners`);
            } catch (e) {
                console.error('Failed to load auto-tune state:', e.message);
            }
        }
        return autoTuneStates;
    }

    static saveAutoTuneState(autoTuneStates) {
        try {
            const data = Array.from(autoTuneStates.entries()).map(([ip, state]) => ({
                ip,                                             // ip address of the miner
                enabled: state.enabled,                         // is auto-tune enabled.
                mode: state.mode,                               // what mode is auto-tune set too
                kwhPrice: state.kwhPrice || null,               // what is the cost of electricity
                dailyCostLimit: state.dailyCostLimit || null,   // what is the daily cost limit
                currentVoltage: state.currentVoltage,           // current voltage
                currentFreq: state.currentFreq,                 // current frequency
                lastShares: state.lastShares,                   // last shares
                lastErrorCount: state.lastErrorCount,           // last error count
                errorHistory: state.errorHistory || [],         // history of errors
                stableCycleCount: state.stableCycleCount || 0,  // stable cycle count
                lastAction: state.lastAction || 'maintain',     // last action
                lastGoodVoltage: state.lastGoodVoltage || null, // last good voltage
                lastGoodFreq: state.lastGoodFreq || null,       // last good frequency
                faultCounter: state.faultCounter || 0,          // fault counter
                faultHistory: state.faultHistory || [],         // history of faults
                adaptiveLimits: state.adaptiveLimits || null,   // adaptive limits
                tuningLog: state.tuningLog || [],               // tuning log
                gridHistory: state.gridHistory || {}            // grid history
            }));
            fs.writeFileSync(CONFIG.FILES.AUTOTUNE, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save auto-tune state:', e);
        }
    }

    static loadHistory() {
        if (fs.existsSync(CONFIG.FILES.HISTORY)) {
            try {
                const data = JSON.parse(fs.readFileSync(CONFIG.FILES.HISTORY, 'utf8'));
                const cutoff = Date.now() - (24 * 60 * 60 * 1000);
                return data.filter(p => p.timestamp > cutoff);
            } catch (e) {
                console.error('Failed to load history.json:', e);
            }
        }
        return [];
    }

    static saveHistory(history) {
        try {
            fs.writeFileSync(CONFIG.FILES.HISTORY, JSON.stringify(history));
        } catch (e) {
            console.error('Failed to save history:', e);
        }
    }
}

module.exports = StorageService;
