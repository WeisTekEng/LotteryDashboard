const socket = io();
const nerdGrid = document.getElementById('nerdminer-grid');
const nerdHeader = document.getElementById('nerdminer-header');
const otherGrid = document.getElementById('other-miner-grid');
const totalHashEl = document.getElementById('total-hashrate');
const modal = document.getElementById('configModal');
const addModal = document.getElementById('addDeviceModal');

const miners = {};
let currentFleetHash = 0;
let currentNetworkHash = 0;
let btcStats = {};
let bchStats = {};

// Navigation
function toggleMenu() {
    const menu = document.getElementById('nav-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
}

function switchView(viewName) {
    const statsView = document.getElementById('stats-view');
    const minersView = document.getElementById('miners-view');
    const logsView = document.getElementById('logs-view');
    const settingsView = document.getElementById('settings-view');
    const menu = document.getElementById('nav-menu');

    if (statsView) statsView.style.display = 'none';
    if (minersView) minersView.style.display = 'none';
    if (logsView) logsView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'none';

    if (viewName === 'stats' && statsView) {
        statsView.style.display = 'block';
        document.title = 'NerdMiner Stats';
    } else if (viewName === 'miners' && minersView) {
        minersView.style.display = 'block';
        document.title = 'Miners Pool';
    } else if (viewName === 'logs' && logsView) {
        logsView.style.display = 'block';
        document.title = 'Server Logs';
        const container = document.getElementById('log-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    } else if (viewName === 'settings' && settingsView) {
        settingsView.style.display = 'block';
        document.title = 'Dashboard Settings';
        loadGlobalConfig();
    }

    if (menu) {
        menu.style.display = 'none';
    }
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('nav-menu');
    const btn = document.querySelector('header button');
    if (menu && menu.style.display === 'block' && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.style.display = 'none';
    }
});

// Modals
async function openConfigModal(ip) {
    document.getElementById('configIp').value = ip;
    document.getElementById('configPool').value = 'Loading...';
    document.getElementById('configPort').value = '';
    document.getElementById('configAddr').value = '';
    document.getElementById('configPass').value = '';
    document.getElementById('configTz').value = '';

    modal.classList.add('active');

    const minerKey = Object.keys(miners).find(key => miners[key].ip === ip);
    const miner = miners[minerKey];
    const minerName = (miner && miner.miner && miner.miner !== 'Unknown') ? miner.miner : 'Miner';
    document.getElementById('configModalTitle').innerText = `${minerName} Configuration`;

    try {
        const res = await fetch(`/miners/${ip}/config`);
        if (!res.ok) throw new Error('Failed to fetch config');
        const data = await res.json();

        document.getElementById('configPool').value = data.pool || '';
        document.getElementById('configPort').value = data.port || '';
        document.getElementById('configAddr').value = data.address || '';
        document.getElementById('configPass').value = data.password || '';
        document.getElementById('configTz').value = data.timezone || 0;

        const knownMiner = miners[minerKey];
        document.getElementById('configCoin').value = (knownMiner && knownMiner.coin) ? knownMiner.coin : 'BTC';
        document.getElementById('configFallbackCoin').value = (knownMiner && knownMiner.fallbackCoin) ? knownMiner.fallbackCoin : '';

    } catch (e) {
        alert('Error loading configuration: ' + e.message);
        closeConfigModal();
    }
}

function closeConfigModal() {
    modal.classList.remove('active');
}

async function saveConfig() {
    const ip = document.getElementById('configIp').value;
    const btn = document.querySelector('#configModal .btn-primary');
    const originalText = btn.innerText;

    const config = {
        pool: document.getElementById('configPool').value,
        port: parseInt(document.getElementById('configPort').value),
        address: document.getElementById('configAddr').value,
        password: document.getElementById('configPass').value,
        timezone: parseInt(document.getElementById('configTz').value)
    };

    btn.disabled = true;
    btn.innerText = 'Saving...';

    try {
        const res = await fetch(`/miners/${ip}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Save failed');

        alert('Configuration saved! Miner is restarting...');
        closeConfigModal();
    } catch (e) {
        alert('Error saving configuration: ' + e.message);
    } finally {
        try {
            await fetch(`/miners/${ip}/metadata`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coin: document.getElementById('configCoin').value,
                    fallbackCoin: document.getElementById('configFallbackCoin').value || null
                })
            });
        } catch (err) {
            console.error('Failed to save metadata', err);
        }

        btn.disabled = false;
        btn.innerText = originalText;
    }
}

function openAddModal() {
    document.getElementById('addDeviceIp').value = '';
    document.getElementById('addDeviceName').value = '';
    addModal.classList.add('active');
}

function closeAddModal() {
    addModal.classList.remove('active');
}

async function addMiner() {
    const ip = document.getElementById('addDeviceIp').value;
    const name = document.getElementById('addDeviceName').value;
    const btn = document.querySelector('#addDeviceModal .btn-primary');
    const originalText = btn.innerText;

    if (!ip) {
        alert('Please enter an IP address');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Adding...';

    try {
        const res = await fetch('/miners/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, name })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to add miner');

        closeAddModal();
        alert('Device added! It should appear in a few seconds.');
    } catch (e) {
        alert('Error adding device: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// Socket Events
socket.on('init_miners', (data) => {
    Object.assign(miners, data);
    render();
});

socket.on('miner_update', (data) => {
    const key = data.id || data.ip;
    miners[key] = data;
    render();
});

socket.on('miner_remove', (id) => {
    delete miners[id];
    render();
});

socket.on('bitcoin_stats', (data) => {
    document.getElementById('bitcoin-card').style.display = 'block';
    document.getElementById('btc-price').innerText = `$${data.price.toLocaleString()}`;
    document.getElementById('btc-height').innerText = data.height.toLocaleString();
    document.getElementById('btc-halving').innerText = `${data.halvingProgress}%`;
    document.getElementById('btc-halving-bar').style.width = `${data.halvingProgress}%`;

    const diffVal = data.difficulty;
    let diffStr = diffVal.toLocaleString();
    if (diffVal > 1e12) diffStr = (diffVal / 1e12).toFixed(2) + ' T';
    document.getElementById('btc-diff').innerText = diffStr;

    currentNetworkHash = data.networkHashrate;
    document.getElementById('btc-network-hash').innerHTML = formatHashrate(data.networkHashrate / 1000);

    if (data.fees) {
        document.getElementById('btc-fees').innerHTML = `
            <span style="color: #ef4444">${data.fees.fastestFee}</span> / 
            <span style="color: #f7931a">${data.fees.hourFee}</span>
        `;
    }

    if (data.price) {
        btcStats = data;
        const reward = 3.125 * data.price;
        document.getElementById('btc-block-value').innerText = `$${reward.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
    updateLuckStats();
});

socket.on('bch_stats', (data) => {
    bchStats = data;
    const card = document.getElementById('bch-card');
    if (card) card.style.display = 'block';

    if (data.price) document.getElementById('bch-price').innerText = `$${data.price.toLocaleString()}`;
    if (data.height) document.getElementById('bch-height').innerText = data.height.toLocaleString();

    const diffVal = data.difficulty;
    let diffStr = diffVal.toLocaleString();
    if (diffVal > 1e12) diffStr = (diffVal / 1e12).toFixed(2) + ' T';
    else if (diffVal > 1e9) diffStr = (diffVal / 1e9).toFixed(2) + ' G';

    if (data.difficulty) document.getElementById('bch-diff').innerText = diffStr;

    if (data.halvingProgress) {
        document.getElementById('bch-halving').innerText = `${data.halvingProgress}%`;
        document.getElementById('bch-halving-bar').style.width = `${data.halvingProgress}%`;
    }

    if (data.networkHashrate) {
        document.getElementById('bch-network-hash').innerHTML = formatHashrate(data.networkHashrate / 1000);
    }
});

// Luck Stats
function updateLuckStats() {
    let totalBTC = 0, totalBCH = 0, maxDiff = 0;

    for (const key in miners) {
        const d = parseFloat(miners[key].bestDiff) || 0;
        if (d > maxDiff) maxDiff = d;

        const h = (parseFloat(miners[key].hashrate) || 0) * 1000;
        if (miners[key].coin === 'BCH') totalBCH += h;
        else totalBTC += h;
    }

    const bestDiffEl = document.getElementById('best-diff-overall');
    if (bestDiffEl) bestDiffEl.innerText = formatDifficulty(maxDiff);

    if (btcStats && btcStats.difficulty && totalBTC > 0) {
        const probPerBlock = totalBTC / (btcStats.networkHashrate || 1);
        const blocksPerDay = 144;
        const probPerDay = 1 - Math.pow(1 - probPerBlock, blocksPerDay);
        document.getElementById('btc-daily-chance').innerText = (probPerDay * 100).toFixed(9) + '%';

        const daysToWin = (1 / probPerBlock) / blocksPerDay;
        const yearsToWin = daysToWin / 365;
        let timeString = yearsToWin > 1000 ? `${(yearsToWin / 1000).toFixed(1)}k Years` : (yearsToWin > 1 ? `${yearsToWin.toFixed(1)} Years` : `${daysToWin.toFixed(1)} Days`);
        document.getElementById('btc-time-to-win').innerText = `Est: ${timeString}`;
    }

    if (bchStats && bchStats.difficulty && totalBCH > 0) {
        const netHash = bchStats.networkHashrate || (bchStats.difficulty * Math.pow(2, 32) / 600);
        const probPerBlock = totalBCH / netHash;
        const blocksPerDay = 144;
        const probPerDay = 1 - Math.pow(1 - probPerBlock, blocksPerDay);
        document.getElementById('bch-daily-chance').innerText = (probPerDay * 100).toFixed(9) + '%';

        const daysToWin = (1 / probPerBlock) / blocksPerDay;
        const yearsToWin = daysToWin / 365;
        let timeString = yearsToWin > 1000 ? `${(yearsToWin / 1000).toFixed(1)}k Years` : (yearsToWin > 1 ? `${yearsToWin.toFixed(1)} Years` : `${daysToWin.toFixed(1)} Days`);
        document.getElementById('bch-time-to-win').innerText = `Est: ${timeString}`;

        if (bchStats.price) {
            const reward = 3.125 * bchStats.price;
            document.getElementById('bch-block-value').innerText = `$${reward.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        }
    }
}

// Charting
const ctx = document.getElementById('hashrateChart').getContext('2d');
const hashrateChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'BTC Hashrate (KH/s)',
                data: [],
                borderColor: '#f7931a',
                backgroundColor: 'rgba(247, 147, 26, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            },
            {
                label: 'BCH Hashrate (KH/s)',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: true, labels: { color: '#94a3b8' } }
        },
        scales: {
            x: { display: false },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#94a3b8' }
            }
        }
    }
});

function updateGraph(history) {
    const labels = history.map(p => new Date(p.timestamp).toLocaleTimeString());
    const btcData = history.map(p => (p.btc !== undefined) ? p.btc : (p.hashrate || 0));
    const bchData = history.map(p => (p.bch !== undefined) ? p.bch : 0);

    hashrateChart.data.labels = labels;
    hashrateChart.data.datasets[0].data = btcData;
    hashrateChart.data.datasets[1].data = bchData;
    hashrateChart.update();

    if (labels.length > 0) {
        const sumBTC = btcData.reduce((a, b) => a + b, 0);
        const avgBTC = sumBTC / btcData.length;
        const sumBCH = bchData.reduce((a, b) => a + b, 0);
        const avgBCH = sumBCH / bchData.length;

        document.getElementById('hourly-avg').innerHTML =
            `<span style="color: #f7931a; font-size: 1.5rem;">${formatHashrate(avgBTC)}</span> <span style="font-size: 1rem; color: #94a3b8;">/</span> <span style="color: #10b981; font-size: 1.5rem;">${formatHashrate(avgBCH)}</span>`;
    }
}

socket.on('init_history', (history) => {
    updateGraph(history);
    updateRollingAverages();
});

socket.on('history_update', (point) => {
    hashrateChart.data.labels.push(new Date(point.timestamp).toLocaleTimeString());
    const btcVal = (point.btc !== undefined) ? point.btc : (point.hashrate || 0);
    const bchVal = (point.bch !== undefined) ? point.bch : 0;
    hashrateChart.data.datasets[0].data.push(btcVal);
    hashrateChart.data.datasets[1].data.push(bchVal);

    if (hashrateChart.data.labels.length > 1440) {
        hashrateChart.data.labels.shift();
        hashrateChart.data.datasets[0].data.shift();
        hashrateChart.data.datasets[1].data.shift();
    }
    hashrateChart.update();

    const data0 = hashrateChart.data.datasets[0].data;
    const avg0 = data0.reduce((a, b) => a + b, 0) / data0.length;
    const data1 = hashrateChart.data.datasets[1].data;
    const avg1 = data1.reduce((a, b) => a + b, 0) / data1.length;

    document.getElementById('hourly-avg').innerHTML =
        `<span style="color: #f7931a; font-size: 1.5rem;">${formatHashrate(avg0)}</span> <span style="font-size: 1rem; color: #94a3b8;">/</span> <span style="color: #10b981; font-size: 1.5rem;">${formatHashrate(avg1)}</span>`;

    updateRollingAverages();
});

function updateRollingAverages() {
    const btcData = hashrateChart.data.datasets[0].data;
    const bchData = hashrateChart.data.datasets[1].data;
    if (btcData.length === 0) return;

    const totalData = btcData.map((val, i) => val + (bchData[i] || 0));
    const totalLen = totalData.length;

    const getAvg = (minutes) => {
        if (totalLen === 0) return 0;
        const count = Math.min(minutes, totalLen);
        const slice = totalData.slice(totalLen - count);
        const sum = slice.reduce((a, b) => a + b, 0);
        return sum / count;
    };

    document.getElementById('avg-5m').innerHTML = formatHashrate(getAvg(5));
    document.getElementById('avg-1h').innerHTML = formatHashrate(getAvg(60));
    document.getElementById('avg-24h').innerHTML = formatHashrate(getAvg(1440));
}

// Misc
function copyBtcAddress() {
    const addressEl = document.getElementById('btc-donation-address');
    const address = addressEl.innerText;
    navigator.clipboard.writeText(address).then(() => {
        const btn = event.target.closest('.copy-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
        btn.style.background = '#059669';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
        }, 2000);
    });
}

function updateMinerCoin(ip, coin) {
    fetch(`/miners/${ip}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coin: coin })
    });
}

function toggleAutotune(ip, mode) {
    if (mode === 'aggressive') {
        if (!confirm("WARNING: Aggressive auto-tuning increases voltage and frequency beyond recommended limits. This may reduce hardware lifespan or cause permanent damage. Continue?")) {
            render();
            return;
        }
    }
    fetch(`/miners/${ip}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoTune: mode })
    });
}

function clearLogs() {
    document.getElementById('log-container').innerHTML = '';
}

function appendLog(log) {
    const container = document.getElementById('log-container');
    if (!container) return;

    const div = document.createElement('div');
    const time = new Date(log.timestamp).toLocaleTimeString();

    let color = '#f8fafc';
    if (log.level === 'WRN') color = '#facc15';
    if (log.level === 'ERR') color = '#ef4444';
    if (log.message.includes('[AutoTune]')) color = '#10b981';

    div.style.color = color;
    div.innerHTML = `<span style="color: #94a3b8;">[${time}]</span> <span style="font-weight: 600;">${log.level}</span>: ${log.message}`;

    const isAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 50;
    container.appendChild(div);
    if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
    }

    if (container.children.length > 500) {
        container.removeChild(container.firstChild);
    }
}

socket.on('init_logs', (logs) => {
    const container = document.getElementById('log-container');
    if (container) {
        container.innerHTML = '';
        logs.forEach(appendLog);
    }
});

socket.on('log_entry', (log) => {
    appendLog(log);
});

// --- Global Configuration Editor ---
let globalConfig = null;

async function loadGlobalConfig() {
    const container = document.getElementById('config-editor-cards');
    if (!container) return;

    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('Failed to fetch config');
        globalConfig = await res.json();
        renderConfigEditor(globalConfig);
    } catch (e) {
        container.innerHTML = `<div style="color: #ef4444;">Error loading config: ${e.message}</div>`;
    }
}

function getUnitLabel(key) {
    const k = key.toLowerCase();
    if (k.includes('voltage') || k.includes('volts')) return ' (mV)';
    if (k.includes('freq')) return ' (MHz)';
    if (k.includes('interval') || k.includes('timeout') || k.includes('adjust')) return ' (ms)';
    if (k.includes('temp')) return ' (°C)';
    if (k.includes('watts')) return ' (W)';
    if (k.includes('rate')) return ' (ratio 0-1)';
    if (k.includes('efficiency')) return ' (J/TH)';
    return '';
}

function renderConfigEditor(config) {
    const container = document.getElementById('config-editor-cards');
    if (!container) return;
    container.innerHTML = '';

    // Helper to create a setting card
    const createCard = (title, settings, pathPrefix) => {
        const card = document.createElement('div');
        card.className = 'miner-card';
        card.style.height = 'auto';

        card.innerHTML = `
            <div class="card-header" style="padding: 1rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 0;">
                <div>
                    <div class="miner-id" style="font-size: 1.1rem; color: #f8fafc;">${title}</div>
                    <div class="miner-ip" style="font-size: 0.75rem;">${title.includes('Auto-Tune') ? 'Tuning Profile' : 'System Parameters'}</div>
                </div>
            </div>
            <div style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
                ${Object.entries(settings).map(([key, value]) => {
            if (typeof value === 'object' && value !== null) return ''; // Skip nested here
            const unit = getUnitLabel(key);
            return `
                        <div class="form-group" style="margin-bottom: 0;">
                            <label class="form-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;">${key}${unit}</label>
                            <input type="${typeof value === 'number' ? 'number' : 'text'}" 
                                   class="form-input" 
                                   data-path="${pathPrefix}.${key}" 
                                   value="${value}" 
                                   style="background: rgba(0,0,0,0.2); font-size: 0.9rem; padding: 0.5rem;">
                        </div>
                    `;
        }).join('')}
            </div>
        `;
        return card;
    };

    container.appendChild(createCard('Dashboard Network', config.PORTS, 'PORTS'));
    container.appendChild(createCard('Performance Limits', config.LIMITS, 'LIMITS'));

    // AutoTune Profiles
    if (config.AUTOTUNE) {
        for (const [profile, settings] of Object.entries(config.AUTOTUNE)) {
            const title = profile.charAt(0).toUpperCase() + profile.slice(1);
            container.appendChild(createCard(`Auto-Tune: ${title}`, settings, `AUTOTUNE.${profile}`));
        }
    }
}

async function saveGlobalConfig() {
    const inputs = document.querySelectorAll('#config-editor-cards input');
    const newConfig = JSON.parse(JSON.stringify(globalConfig)); // Deep clone

    inputs.forEach(input => {
        const path = input.getAttribute('data-path').split('.');
        let current = newConfig;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        const key = path[path.length - 1];
        const value = input.type === 'number' ? parseFloat(input.value) : input.value;
        current[key] = value;
    });

    const btn = document.querySelector('#settings-view .btn-primary');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Saving...';

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig)
        });
        const data = await res.json();
        if (data.success) {
            alert(data.restartRequired ? 'Settings saved! A restart is required for port changes.' : 'Settings saved successfully!');
            globalConfig = newConfig;
        } else {
            throw new Error(data.error);
        }
    } catch (e) {
        alert('Failed to save settings: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}
