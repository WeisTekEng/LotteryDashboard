const dgram = require('dgram');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const CONFIG = require('./src/config');
const StorageService = require('./src/services/StorageService');
const MinerService = require('./src/services/MinerService');
const ScannerService = require('./src/services/ScannerService');
const AutoTuneEngine = require('./src/services/AutoTuneEngine');
const LogService = require('./src/services/LogService');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const logService = new LogService(io);
const udpSocket = dgram.createSocket('udp4');

// Initialization
const autoTuneStates = StorageService.loadAutoTuneState();
const minerService = new MinerService(io, autoTuneStates);
const scannerService = new ScannerService(minerService);
const autoTuneEngine = new AutoTuneEngine(autoTuneStates);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Socket.io ---
io.on('connection', (socket) => {
  socket.emit('init_miners', minerService.getMiners());
  socket.emit('init_history', minerService.getHistory());
  if (minerService.bitcoinStats.price) socket.emit('bitcoin_stats', minerService.bitcoinStats);
  if (minerService.bchStats.price) socket.emit('bch_stats', minerService.bchStats);
  socket.emit('init_logs', logService.getLogs());
});

// --- UDP Listener (Discovery) ---
udpSocket.on('message', (msg, rinfo) => {
  try {
    const data = JSON.parse(msg.toString());
    const id = data.id || rinfo.address;
    const ip = data.ip || rinfo.address;

    const existing = minerService.miners[id] || {};
    minerService.miners[id] = {
      ...existing,
      ...data,
      lastSeen: Date.now(),
      ip: ip
    };

    if (!existing.address) {
      minerService.fetchMinerConfig(ip, id);
    }

    io.emit('miner_update', minerService.miners[id]);
  } catch (e) {
    console.error('UDP Error:', e.message);
  }
});

udpSocket.bind(CONFIG.PORTS.UDP, () => {
  console.log(`UDP Discovery listening on port ${CONFIG.PORTS.UDP}`);
});

// --- API Routes ---

// Proxy Config
app.get('/miners/:ip/config', async (req, res) => {
  try {
    const { ip } = req.params;
    const response = await fetch(`http://${ip}/api/config`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Miner returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/miners/:ip/config', async (req, res) => {
  try {
    const { ip } = req.params;
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
    res.status(502).json({ error: e.message });
  }
});

// Metadata Management
app.post('/miners/add', (req, res) => {
  const { ip, name } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP required' });

  const existing = minerService.httpMiners.get(ip) || {};
  minerService.httpMiners.set(ip, { ...existing, name: name || existing.name || 'Bitaxe', coin: existing.coin || 'BTC' });

  StorageService.saveMiners(minerService.httpMiners);
  minerService.pollHttpMiner(ip);
  res.json({ success: true });
});

app.post('/miners/:ip/metadata', (req, res) => {
  const { ip } = req.params;
  const { coin, fallbackCoin, autoTune } = req.body;

  if (!minerService.httpMiners.has(ip)) return res.status(404).json({ error: 'Miner not found' });

  const data = minerService.httpMiners.get(ip);
  if (coin) data.coin = coin;
  if (fallbackCoin !== undefined) data.fallbackCoin = fallbackCoin || undefined;

  if (autoTune !== undefined) {
    if (autoTune === 'off') {
      autoTuneStates.delete(ip);
    } else {
      // Preserve existing state if present, or create new
      const existingState = autoTuneStates.get(ip) || {
        lastAdjustment: 0,
        tempHistory: [],
        currentVoltage: null,
        currentFreq: null,
        lastShares: { valid: 0, invalid: 0 },
        lastErrorCount: 0,
        errorHistory: [],
        stableCycleCount: 0,
        lastAction: 'maintain',
        stabilizationUntil: 0,
        restarting: false,
        faultHistory: []
      };

      autoTuneStates.set(ip, {
        ...existingState,
        enabled: true,
        mode: autoTune,
        kwhPrice: req.body.kwhPrice ? parseFloat(req.body.kwhPrice) : existingState.kwhPrice,
        dailyCostLimit: req.body.dailyCostLimit ? parseFloat(req.body.dailyCostLimit) : existingState.dailyCostLimit
      });
    }
  }

  minerService.httpMiners.set(ip, data);
  StorageService.saveMiners(minerService.httpMiners);
  StorageService.saveAutoTuneState(autoTuneStates);
  minerService.pollHttpMiner(ip);
  res.json({ success: true });
});

// Dashboard Config Management
app.get('/api/config', (req, res) => {
  // Return the current config but hide internal FILES paths for security/clarify
  const { FILES, ...safeConfig } = CONFIG;
  res.json(safeConfig);
});

app.post('/api/config', (req, res) => {
  try {
    const newConfig = req.body;

    // Deep merge helper
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

    // Update running config (excluding internal FILES)
    const { FILES, ...cleanOverrides } = newConfig;
    merge(CONFIG, cleanOverrides);

    // Save to data/config.json
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, 'data', 'config.json');

    // We save the full clean overrides to ensure persistence
    fs.writeFileSync(configPath, JSON.stringify(cleanOverrides, null, 2));

    console.log('[Config] Configuration updated and saved to data/config.json');

    // Trigger immediate scan if networking/subnet might have changed
    scannerService.runNetworkScan().catch(err => console.error('[Scanner] Manual trigger failed:', err));

    res.json({ success: true, restartRequired: !!newConfig.PORTS });
  } catch (e) {
    console.error('[Config] Failed to save config:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get adaptive limits for a specific miner
app.get('/api/autotune/:ip/adaptive-limits', (req, res) => {
  const { ip } = req.params;
  const limits = autoTuneEngine.getAdaptiveLimits(ip);
  console.log(limits);
  //const resp = fetch(`http://${ip}/api/system/info`, { signal: AbortSignal.timeout(3000) });
  //if (!resp.ok) return;
  //const data = resp.json();
  //console.log(data);

  if (!limits) {
    return res.status(404).json({
      error: 'Miner not found or AutoTune not enabled'
    });
  }

  res.json({
    ip,
    adaptive: limits.adaptiveLimits,
    config: limits.configLimits,
    reduction: {
      voltage: limits.configLimits.maxVoltage - limits.adaptiveLimits.maxVoltage,
      frequency: limits.configLimits.maxFreq - limits.adaptiveLimits.maxFreq
    },
    isLimited: limits.adaptiveLimits.maxVoltage < limits.configLimits.maxVoltage ||
      limits.adaptiveLimits.maxFreq < limits.configLimits.maxFreq
  });
});

// Reset adaptive limits to config defaults
app.post('/api/autotune/:ip/adaptive-limits/reset', (req, res) => {
  const { ip } = req.params;
  const success = autoTuneEngine.resetAdaptiveLimits(ip);

  if (!success) {
    return res.status(404).json({
      error: 'Miner not found or AutoTune not enabled'
    });
  }

  const limits = autoTuneEngine.getAdaptiveLimits(ip);
  res.json({
    message: 'Adaptive limits reset to config defaults',
    ip,
    limits: limits.adaptiveLimits
  });
});

// Manually set adaptive limits
app.put('/api/autotune/:ip/adaptive-limits', (req, res) => {
  const { ip } = req.params;
  const { maxVoltage, maxFreq } = req.body;

  if (!maxVoltage || !maxFreq) {
    return res.status(400).json({
      error: 'maxVoltage and maxFreq are required'
    });
  }

  const success = autoTuneEngine.setAdaptiveLimits(ip, maxVoltage, maxFreq);

  if (!success) {
    return res.status(400).json({
      error: 'Invalid limits or miner not found. Check server logs for details.'
    });
  }

  const limits = autoTuneEngine.getAdaptiveLimits(ip);
  res.json({
    message: 'Adaptive limits updated',
    ip,
    limits: limits.adaptiveLimits
  });
});

// Get summary of all miners' adaptive limits
app.get('/api/autotune/adaptive-limits/summary', (req, res) => {
  const summary = [];

  autoTuneEngine.autoTuneStates.forEach((state, ip) => {
    const limits = autoTuneEngine.getAdaptiveLimits(ip);
    //const resp = fetch(`http://${ip}/api/system/info`, { signal: AbortSignal.timeout(3000) });
    //if (!resp.ok) return;
    //const data = resp.json();
    if (limits) {
      const isLimited = limits.adaptiveLimits.maxVoltage < limits.configLimits.maxVoltage ||
        limits.adaptiveLimits.maxFreq < limits.configLimits.maxFreq;

      summary.push({
        ip,
        mode: state.mode,
        currentSettings: {
          voltage: state.currentVoltage,
          frequency: state.currentFreq
        },
        adaptive: limits.adaptiveLimits,
        config: limits.configLimits,
        isLimited,
        faultCount: limits.faultHistory?.length || 0,
        lastFault: limits.faultHistory?.length > 0
          ? limits.faultHistory[limits.faultHistory.length - 1]
          : null,
        faultHistory: limits.faultHistory || []
      });
    }
  });

  res.json({
    totalMiners: summary.length,
    limitedMiners: summary.filter(m => m.isLimited).length,
    miners: summary
  });
});
minerService.startBackgroundJobs();
scannerService.start();
autoTuneEngine.startLoop();

server.listen(CONFIG.PORTS.HTTP, () => {
  console.log(`Dashboard running at http://localhost:${CONFIG.PORTS.HTTP}`);
});
