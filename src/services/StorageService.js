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
                        enabled: item.enabled,
                        mode: item.mode,
                        lastAdjustment: 0,
                        tempHistory: [],
                        currentVoltage: item.currentVoltage,
                        currentFreq: item.currentFreq,
                        lastShares: item.lastShares || { valid: 0, invalid: 0 },
                        lastErrorCount: item.lastErrorCount || 0,
                        errorHistory: item.errorHistory || [],
                        stableCycleCount: item.stableCycleCount || 0,
                        lastAction: item.lastAction || 'maintain',
                        stabilizationUntil: 0,
                        restarting: false
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
                ip,
                enabled: state.enabled,
                mode: state.mode,
                currentVoltage: state.currentVoltage,
                currentFreq: state.currentFreq,
                lastShares: state.lastShares,
                lastErrorCount: state.lastErrorCount,
                errorHistory: state.errorHistory || [],
                stableCycleCount: state.stableCycleCount || 0,
                lastAction: state.lastAction || 'maintain'
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
