const CONFIG = require('../config');
const StorageService = require('./StorageService');

class MinerService {
    constructor(io, autoTuneStates) {
        this.io = io;
        this.autoTuneStates = autoTuneStates || new Map();
        this.miners = {}; // id -> data
        this.httpMiners = StorageService.loadMiners(); // ip -> {name, coin, fallbackCoin}
        this.hashrateHistory = StorageService.loadHistory();
        this.bitcoinStats = {};
        this.bchStats = {};
    }

    getMiners() {
        return this.miners;
    }

    getHistory() {
        return this.hashrateHistory;
    }

    async fetchMinerConfig(ip, id) {
        try {
            const resp = await fetch(`http://${ip}/api/config`, { signal: AbortSignal.timeout(3000) });
            if (resp.ok) {
                const config = await resp.json();
                if (this.miners[id]) {
                    this.miners[id].address = config.address;
                    this.io.emit('miner_update', this.miners[id]);
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    async pollHttpMiner(ip) {
        try {
            const resp = await fetch(`http://${ip}/api/system/info`, { signal: AbortSignal.timeout(3000) });
            if (!resp.ok) return;

            const data = await resp.json();
            const settings = this.httpMiners.get(ip) || { name: 'Bitaxe', coin: 'BTC' };

            let coinType = settings.coin || 'BTC';
            if (data.isUsingFallbackStratum && settings.fallbackCoin) {
                coinType = settings.fallbackCoin;
            }

            const autoTuneEntry = this.autoTuneStates.get(ip);
            const minerData = {
                id: data.macAddr,
                ip: ip,
                miner: settings.name || data.ASICModel || 'Bitaxe',
                coin: coinType,
                autoTune: autoTuneEntry ? autoTuneEntry.mode : 'off',
                hashrate: (data.hashRate * 1000000).toFixed(2),
                temp: data.temp.toFixed(1),
                vrTemp: data.vrTemp ? data.vrTemp.toFixed(1) : null,
                uptime: data.uptimeSeconds,
                valid: data.sharesAccepted,
                bestDiff: data.bestDiff,
                bestSessionDiff: data.bestSessionDiff,
                pool: data.isUsingFallbackStratum ? data.fallbackStratumURL : data.stratumURL,
                usingFallback: !!data.isUsingFallbackStratum,
                address: data.stratumUser,
                templates: 0,
                lastSeen: Date.now(),
                source: 'http',
                chipInfo: (data.ASICModel && data.asicCount) ? `${data.ASICModel} (${data.asicCount})` : null,
                freq: data.frequency || 0,
                vCore: data.coreVoltage || 0,
                power: data.power ? data.power.toFixed(2) : 0,
                inputVoltage: data.voltage ? (data.voltage / 1000).toFixed(2) : 0
            };

            this.miners[minerData.id] = minerData;
            this.io.emit('miner_update', minerData);
        } catch (e) {
            // Ignore
        }
    }

    async addDiscoveredMiner(ip, data) {
        if (!this.httpMiners.has(ip)) {
            const name = data.hostname || 'Bitaxe';
            console.log(`[Scanner] Auto-discovered: ${name} (${ip})`);
            this.httpMiners.set(ip, { name: name, coin: 'BTC' });
            StorageService.saveMiners(this.httpMiners);
            this.pollHttpMiner(ip);
        }
    }

    async fetchBitcoinStats() {
        try {
            const [priceRes, heightRes, diffRes, feesRes, miningRes] = await Promise.all([
                fetch('https://mempool.space/api/v1/prices'),
                fetch('https://mempool.space/api/blocks/tip/height'),
                fetch('https://mempool.space/api/v1/difficulty-adjustment'),
                fetch('https://mempool.space/api/v1/fees/recommended'),
                fetch('https://mempool.space/api/v1/mining/hashrate/3d')
            ]);

            const prices = await priceRes.json();
            const height = parseInt(await heightRes.text());
            const miningData = await miningRes.json();
            const fees = await feesRes.json();

            const blocksPerHalving = 210000;
            const blocksUntilHalving = (Math.floor(height / blocksPerHalving) + 1) * blocksPerHalving - height;

            this.bitcoinStats = {
                price: prices.USD,
                height: height,
                difficulty: miningData.currentDifficulty,
                networkHashrate: miningData.currentHashrate,
                blocksUntilHalving: blocksUntilHalving,
                halvingProgress: (((blocksPerHalving - blocksUntilHalving) / blocksPerHalving) * 100).toFixed(2),
                fees: fees,
                blockReward: 3.125
            };

            this.io.emit('bitcoin_stats', this.bitcoinStats);
        } catch (e) {
            console.error('Error fetching Bitcoin stats:', e.message);
        }
    }

    async fetchBCHStats() {
        try {
            const resp = await fetch('https://api.blockchair.com/bitcoin-cash/stats');
            if (resp.ok) {
                const json = await resp.json();
                const data = json.data;
                const height = data.blocks;
                const blocksPerHalving = 210000;
                const blocksUntilHalving = (Math.floor(height / blocksPerHalving) + 1) * blocksPerHalving - height;

                this.bchStats = {
                    price: data.market_price_usd,
                    height: height,
                    difficulty: data.difficulty,
                    networkHashrate: parseFloat(data.hashrate_24h),
                    halvingProgress: (((blocksPerHalving - blocksUntilHalving) / blocksPerHalving) * 100).toFixed(2),
                    fees: null
                };
                this.io.emit('bch_stats', this.bchStats);
            }
        } catch (e) {
            console.error('Error fetching BCH stats:', e.message);
        }
    }

    startBackgroundJobs() {
        // Poll HTTP miners
        setInterval(() => {
            this.httpMiners.forEach((_, ip) => this.pollHttpMiner(ip));
        }, CONFIG.LIMITS.POLL_INTERVAL);

        // Stats fetching
        setInterval(() => {
            this.fetchBitcoinStats();
            this.fetchBCHStats();
        }, CONFIG.LIMITS.STATS_FETCH_INTERVAL);

        // History tracking
        setInterval(() => {
            let totalBTC = 0, totalBCH = 0;
            for (const id in this.miners) {
                const val = parseFloat(this.miners[id].hashrate) || 0;
                if (this.miners[id].coin === 'BCH') totalBCH += val;
                else totalBTC += val;
            }
            const point = { timestamp: Date.now(), btc: totalBTC, bch: totalBCH };
            this.hashrateHistory.push(point);
            if (this.hashrateHistory.length > CONFIG.LIMITS.MAX_HISTORY) this.hashrateHistory.shift();
            StorageService.saveHistory(this.hashrateHistory);
            this.io.emit('history_update', point);
        }, 60000);

        // Timeout detection
        setInterval(() => {
            const now = Date.now();
            for (const id in this.miners) {
                if (now - this.miners[id].lastSeen > CONFIG.LIMITS.MINER_TIMEOUT) {
                    delete this.miners[id];
                    this.io.emit('miner_remove', id);
                }
            }
        }, 5000);

        // Initial fetches
        this.fetchBitcoinStats();
        this.fetchBCHStats();
    }
}

module.exports = MinerService;
