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
      autoTuneStates.set(ip, {
        enabled: true,
        mode: autoTune,
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
        restarting: false
      });
    }
  }

  minerService.httpMiners.set(ip, data);
  StorageService.saveMiners(minerService.httpMiners);
  StorageService.saveAutoTuneState(autoTuneStates);
  minerService.pollHttpMiner(ip);
  res.json({ success: true });
});

// --- Startup ---
minerService.startBackgroundJobs();
scannerService.start();
autoTuneEngine.startLoop();

server.listen(CONFIG.PORTS.HTTP, () => {
  console.log(`Dashboard running at http://localhost:${CONFIG.PORTS.HTTP}`);
});
