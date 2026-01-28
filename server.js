const dgram = require('dgram');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const udpSocket = dgram.createSocket('udp4');

const UDP_PORT = 33333;
const HTTP_PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const miners = {};

// UDP Listener
udpSocket.on('error', (err) => {
  console.log(`UDP error:\n${err.stack}`);
  udpSocket.close();
});

udpSocket.on('message', (msg, rinfo) => {
  console.log(`UDP received: ${msg} from ${rinfo.address}:${rinfo.port}`);
  try {
    const data = JSON.parse(msg.toString());
    const id = data.id || rinfo.address;
    const ip = data.ip || rinfo.address; // Prefer reported IP to bypass Docker NAT

    // Initialize or update miner
    if (!miners[id]) {
      miners[id] = { ...data, lastSeen: Date.now(), ip: ip };
      // New miner discovered: Fetch full config to get BTC address
      fetchMinerConfig(ip, id);
    } else {
      // Preserve existing address if already fetched
      const existingAddr = miners[id].address;
      miners[id] = { ...data, lastSeen: Date.now(), ip: ip };
      if (existingAddr) miners[id].address = existingAddr;
      else fetchMinerConfig(ip, id); // Try fetching again if we missed it
    }

    io.emit('miner_update', miners[id]);
  } catch (e) {
    console.error('Invalid JSON from', rinfo.address, msg.toString());
  }
});

// Helper to fetch config and update miner state
async function fetchMinerConfig(ip, id) {
  try {
    // console.log(`Fetching config for ${id} (${ip})...`);
    const response = await fetch(`http://${ip}/api/config`, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const config = await response.json();
      if (miners[id]) {
        miners[id].address = config.address; // Store address
        io.emit('miner_update', miners[id]); // Push update
      }
    }
  } catch (e) {
    // console.error(`Failed to fetch config for ${ip}:`, e.message);
  }
}

udpSocket.bind(UDP_PORT, () => {
  console.log(`UDP socket listening on port ${UDP_PORT}`);
});

// Clean up old miners
setInterval(() => {
  const now = Date.now();
  for (const id in miners) {
    if (now - miners[id].lastSeen > 30000) { // 30 seconds timeout
      console.log(`Miner ${id} timed out`);
      delete miners[id];
      io.emit('miner_remove', id);
    }
  }
}, 5000);

// Bitcoin Stats
let bitcoinStats = {};

async function fetchBitcoinStats() {
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
    const diffData = await diffRes.json();
    const fees = await feesRes.json();
    const miningData = await miningRes.json();

    // Calculate Halving Progress
    const blocksPerHalving = 210000;
    const currentHalvingCycle = Math.floor(height / blocksPerHalving);
    const nextHalvingBlock = (currentHalvingCycle + 1) * blocksPerHalving;
    const blocksUntilHalving = nextHalvingBlock - height;
    const halvingProgress = ((blocksPerHalving - blocksUntilHalving) / blocksPerHalving) * 100;

    // Calculate Block Value
    const blockSubsidy = 3.125;
    // Estimate fees from API or default (10 mins * 60 secs * XX vBytes/sec? No, simplest is fees/block avg but mempool API gives fee rates)
    // Actually, mempool.space blocks/tip gives total fees. Let's use a simpler heuristic or the fees.fastestFee isn't enough.
    // Let's assume average fees per block is 0.5 BTC for now or fetch recent block stats? 
    // Easier: Just use Price * (3.125) as baseline, alerting " + Fees".
    // Better: We can fetch /api/v1/blocks/tip/height then /api/v1/blocks/ to get recent block reward.
    // For now, let's just send the raw Price and let frontend calculate 3.125 * Price.

    bitcoinStats = {
      price: prices.USD,
      height: height,
      difficulty: miningData.currentDifficulty, // Corrected source
      networkHashrate: miningData.currentHashrate, // Direct from API
      blocksUntilHalving: blocksUntilHalving,
      halvingProgress: halvingProgress.toFixed(2),
      fees: fees,
      blockReward: blockSubsidy // Base subsidy
    };

    io.emit('bitcoin_stats', bitcoinStats);
    console.log('Updated Bitcoin Stats: Price=$', bitcoinStats.price);
  } catch (e) {
    console.error('Error fetching Bitcoin stats:', e.message);
  }
}

// Fetch stats every 60 seconds
setInterval(fetchBitcoinStats, 60000);
// Miner Config Proxy
app.get('/miners/:ip/config', async (req, res) => {
  try {
    const { ip } = req.params;
    console.log(`Proxying GET config to http://${ip}/api/config`);
    const response = await fetch(`http://${ip}/api/config`, { signal: AbortSignal.timeout(5000) }); // 5s timeout
    if (!response.ok) throw new Error(`Miner returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error(`Proxy Error (GET ${req.params.ip}):`, e.cause || e.message);
    res.status(502).json({ error: e.message });
  }
});

app.post('/miners/:ip/config', async (req, res) => {
  try {
    const { ip } = req.params;
    console.log(`Proxying POST config to http://${ip}/api/config`);
    const response = await fetch(`http://${ip}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Miner returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error(`Proxy Error (POST ${req.params.ip}):`, e.cause || e.message);
    res.status(502).json({ error: e.message });
  }
});

fetchBitcoinStats(); // Initial fetch

const hashrateHistory = [];
const MAX_HISTORY = 1440; // 24 hours (1440 minutes)
const HISTORY_FILE = 'history.json';

// Load History from Disk
if (fs.existsSync(HISTORY_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    // Prune data older than 24 hours
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    const recentData = data.filter(p => p.timestamp > cutoff);
    hashrateHistory.push(...recentData);
    console.log(`Loaded ${recentData.length} history points.`);
  } catch (e) {
    console.error('Failed to load history.json:', e);
  }
}

// Update History every 60 seconds
setInterval(() => {
  let totalHashBTC = 0;
  let totalHashBCH = 0;

  for (const id in miners) {
    const val = parseFloat(miners[id].hashrate) || 0;
    if (miners[id].coin === 'BCH') {
      totalHashBCH += val;
    } else {
      totalHashBTC += val;
    }
  }

  const point = {
    timestamp: Date.now(),
    btc: totalHashBTC,
    bch: totalHashBCH,
    // total: totalHashBTC + totalHashBCH // not needed, frontend can sum if desired? Or just show 2 lines.
  };

  hashrateHistory.push(point);
  if (hashrateHistory.length > MAX_HISTORY) {
    hashrateHistory.shift();
  }

  // Persist to disk
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(hashrateHistory));
  } catch (e) {
    console.error('Failed to save history:', e);
  }

  io.emit('history_update', point);
}, 60000);

io.on('connection', (socket) => {
  socket.emit('init_miners', miners);
  socket.emit('init_history', hashrateHistory);
  if (bitcoinStats.price) {
    socket.emit('bitcoin_stats', bitcoinStats);
  }
  if (bchStats.price) {
    socket.emit('bch_stats', bchStats);
  }
});

// Bitaxe Integration

const MINERS_FILE = 'miners.json';
let httpMiners = new Map(); // Map<ip, name>

// Load Persisted Miners
if (fs.existsSync(MINERS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(MINERS_FILE, 'utf8'));
    data.forEach(m => {
      // Store full metadata object or construct it
      // Legacy support: m.name might be just name
      const meta = { name: m.name || 'Bitaxe', coin: m.coin || 'BTC' };
      if (m.fallbackCoin) meta.fallbackCoin = m.fallbackCoin;
      httpMiners.set(m.ip, meta);
    });
    console.log(`Loaded ${httpMiners.size} HTTP miners from file.`);
  } catch (e) {
    console.error('Failed to load miners.json:', e);
  }
}

function saveMiners() {
  const data = Array.from(httpMiners.entries()).map(([ip, val]) => {
    // Handle legacy string values in Map if any remain
    const meta = (typeof val === 'string') ? { name: val, coin: 'BTC' } : val;
    const entry = { ip, name: meta.name, coin: meta.coin };
    if (meta.fallbackCoin) entry.fallbackCoin = meta.fallbackCoin;
    return entry;
  });
  fs.writeFileSync(MINERS_FILE, JSON.stringify(data, null, 2));
}

app.post('/miners/add', (req, res) => {
  const { ip, name } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP address required' });

  if (name) {
    // Check if entry exists, if so update, else set new
    const existing = httpMiners.get(ip) || {};
    if (typeof existing === 'string') {
      httpMiners.set(ip, { name: name, coin: 'BTC' });
    } else {
      httpMiners.set(ip, { ...existing, name: name });
    }
  } else if (!httpMiners.has(ip)) {
    httpMiners.set(ip, { name: 'Bitaxe', coin: 'BTC' }); // Default
  }

  saveMiners();
  console.log(`Added/Updated HTTP miner: ${ip}`);
  pollHttpMiner(ip); // Instant poll
  res.json({ success: true });
});

app.post('/miners/:ip/metadata', (req, res) => {
  const { ip } = req.params;
  const { coin, fallbackCoin } = req.body; // Expect 'BTC' or 'BCH' or others

  if (!httpMiners.has(ip)) {
    return res.status(404).json({ error: 'Miner not found' });
  }

  const current = httpMiners.get(ip);
  // Handle legacy string format if present (migration)
  const data = typeof current === 'string' ? { name: current, coin: 'BTC' } : current;

  if (coin) data.coin = coin;
  if (fallbackCoin !== undefined) data.fallbackCoin = fallbackCoin || undefined; // Remove if empty

  httpMiners.set(ip, data);
  saveMiners();
  console.log(`Updated metadata for ${ip}: Coin=${data.coin}, FallbackCoin=${data.fallbackCoin || 'none'}`);
  pollHttpMiner(ip); // Refresh to push update
  res.json({ success: true });
});

// BCH Stats
let bchStats = {};
async function fetchBCHStats() {
  try {
    // Blockchair API for all BCH stats (Diff, Hash, Price, Height)
    // Free tier allows ~1 request/sec usually, so once per minute is fine.
    const response = await fetch('https://api.blockchair.com/bitcoin-cash/stats');

    if (response.ok) {
      const json = await response.json();
      const data = json.data;

      const height = data.blocks;
      // Calculate Halving Progress
      const blocksPerHalving = 210000;
      const currentHalvingCycle = Math.floor(height / blocksPerHalving);
      const nextHalvingBlock = (currentHalvingCycle + 1) * blocksPerHalving;
      const blocksUntilHalving = nextHalvingBlock - height;
      const halvingProgress = ((blocksPerHalving - blocksUntilHalving) / blocksPerHalving) * 100;

      bchStats = {
        price: data.market_price_usd,
        height: height,
        difficulty: data.difficulty, // ~925G
        networkHashrate: parseFloat(data.hashrate_24h), // ~6.7 EH
        halvingProgress: halvingProgress.toFixed(2),
        fees: null
      };
    } else {
      // Fallback or error logging
      console.error('Blockchair BCH fetch failed:', response.status);
    }

    io.emit('bch_stats', bchStats);
  } catch (e) {
    console.error('Error fetching BCH stats:', e.message);
  }
}
setInterval(fetchBCHStats, 60000);
fetchBCHStats();

async function pollHttpMiner(ip) {
  try {
    const response = await fetch(`http://${ip}/api/system/info`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    const metadata = httpMiners.get(ip); // Object {name, coin, fallbackCoin} or string

    // Normalize metadata
    const settings = (typeof metadata === 'string')
      ? { name: metadata, coin: 'BTC' }
      : (metadata || { name: 'Bitaxe', coin: 'BTC' });

    const customName = settings.name;

    // Determine active coin based on stratum usage
    // Priority: Use manual settings, only switch to fallbackCoin if explicitly configured
    let coinType = settings.coin || 'BTC'; // Default Primary

    // Only switch to fallback coin if:
    // 1. Miner is using fallback stratum AND
    // 2. User has explicitly configured a fallbackCoin
    if (data.isUsingFallbackStratum && settings.fallbackCoin) {
      coinType = settings.fallbackCoin;
    }
    // Note: Removed auto-detection from URL to prevent overriding manual user selections

    // Normalize Bitaxe data to NerdMiner format
    const minerData = {
      id: data.macAddr,
      ip: ip,
      miner: customName || data.ASICModel || 'Bitaxe',
      coin: coinType,
      hashrate: (data.hashRate * 1000000).toFixed(2), // GH/s -> KH/s
      temp: data.temp.toFixed(1),
      vrTemp: data.vrTemp ? data.vrTemp.toFixed(1) : null,
      uptime: data.uptimeSeconds,
      valid: data.sharesAccepted,
      bestDiff: data.bestDiff,
      bestSessionDiff: data.bestSessionDiff,
      pool: data.isUsingFallbackStratum ? data.fallbackStratumURL : data.stratumURL,
      usingFallback: !!data.isUsingFallbackStratum,
      address: data.stratumUser,
      templates: 0, // Not available
      lastSeen: Date.now(),
      source: 'http', // Flag to identify Bitaxe/HTTP miners
      chipInfo: (data.ASICModel && data.asicCount) ? `${data.ASICModel} (${data.asicCount})` : null,
      // Hardware Stats
      freq: data.frequency || 0,
      vCore: data.coreVoltage || 0,
      power: data.power ? data.power.toFixed(2) : 0,
      inputVoltage: data.voltage ? (data.voltage / 1000).toFixed(2) : 0
    };

    miners[minerData.id] = minerData;
    io.emit('miner_update', minerData);
  } catch (e) {
    // console.error(`Failed to poll miner ${ip}:`, e.message);
  }
}

// Poll HTTP miners every 5 seconds
setInterval(() => {
  httpMiners.forEach((name, ip) => pollHttpMiner(ip));
}, 5000);

const os = require('os');

// Auto-Discovery: Subnet Scan (More reliable than mDNS in this setup)
function getLocalSubnets() {
  const interfaces = os.networkInterfaces();
  const subnets = [];
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      // IPv4, not internal (127.0.0.1)
      if (iface.family === 'IPv4' && !iface.internal) {
        // Assume /24 for simplicity or parse CIDR
        // e.g. 192.168.1.15 -> 192.168.1
        const parts = iface.address.split('.');
        parts.pop(); // Remove last octet
        subnets.push(parts.join('.'));
      }
    }
  }
  return [...new Set(subnets)]; // Unique subnets
}

async function checkMinerIp(ip) {
  // Skip if already polling this IP via httpMiners list to avoid double traffic,
  // BUT we need to check if we need to add it.
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout

    // We do a lightweight check using the system info endpoint
    const res = await fetch(`http://${ip}/api/system/info`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      // It's a Bitaxe/Miner!

      // IMPORTANT: Only add if we don't already have it
      if (!httpMiners.has(ip)) {
        const name = data.hostname || 'Bitaxe';
        console.log(`[Scanner] Auto-discovered: ${name} (${ip})`);

        // Add to persistent list
        httpMiners.set(ip, { name: name, coin: 'BTC' });
        saveMiners();

        // Start polling it immediately
        pollHttpMiner(ip);
      }
    }
  } catch (e) {
    // Ignore timeouts/refused
  }
}

async function runNetworkScan() {
  console.log('[Scanner] Starting subnet scan...');
  const subnets = getLocalSubnets();
  for (const subnet of subnets) {
    // console.log(`[Scanner] Scanning ${subnet}.1-254...`);
    const promises = [];
    for (let i = 1; i < 255; i++) {
      // Skip our own gateway/server usually, but .1 might be a miner? 
      const ip = `${subnet}.${i}`;

      promises.push(checkMinerIp(ip));

      // Batching to prevent fd exhaustion
      if (promises.length >= 50) {
        await Promise.all(promises);
        promises.length = 0;
      }
    }
    await Promise.all(promises);
  }
  console.log('[Scanner] Scan complete.');
}

// Run scan every 2 minutes
setInterval(runNetworkScan, 120000);
// Run initial scan after a short delay to let server start
setTimeout(runNetworkScan, 2000);

server.listen(HTTP_PORT, () => {
  console.log(`Dashboard running at http://localhost:${HTTP_PORT}`);
});
