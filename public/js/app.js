
const socket = io();
const nerdGrid = document.getElementById('nerdminer-grid');
const nerdHeader = document.getElementById('nerdminer-header');
const otherGrid = document.getElementById('other-miner-grid');
const totalHashEl = document.getElementById('total-hashrate');
const addModal = document.getElementById('addDeviceModal');

const miners = {};
window.miners = miners; // Expose for other scripts
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

// Updated switchView to include autotune and handle new modules
function switchView(viewName) {
    const statsView = document.getElementById('stats-view');
    const minersView = document.getElementById('miners-view');
    const logsView = document.getElementById('logs-view');
    const settingsView = document.getElementById('settings-view');
    const autotuneView = document.getElementById('autotune-view');
    const menu = document.getElementById('nav-menu');

    // Stop auto-refresh when leaving autotune view
    if (autotuneView && autotuneView.style.display !== 'none') {
        if (typeof stopAutoTuneRefresh === 'function') stopAutoTuneRefresh();
    }

    // Hide all views
    if (statsView) statsView.style.display = 'none';
    if (minersView) minersView.style.display = 'none';
    if (logsView) logsView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'none';
    if (autotuneView) autotuneView.style.display = 'none';

    // Show the requested view
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
        if (typeof loadGlobalConfig === 'function') loadGlobalConfig();
    } else if (viewName === 'autotune' && autotuneView) {
        autotuneView.style.display = 'block';
        document.title = 'Auto-Tune Monitor';
        if (typeof refreshAutoTuneData === 'function') refreshAutoTuneData();
        if (typeof startAutoTuneRefresh === 'function') startAutoTuneRefresh();
    }

    // Hide menu
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

// Modals - Device Addition (Kept in app.js as it's simple)
function openAddModal() {
    document.getElementById('addDeviceIp').value = '';
    document.getElementById('addDeviceName').value = '';
    const addModal = document.getElementById('addDeviceModal');
    if (addModal) addModal.classList.add('active');
}

function closeAddModal() {
    const addModal = document.getElementById('addDeviceModal');
    if (addModal) addModal.classList.remove('active');
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

// Misc Helper Functions
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

async function updateMinerCoin(ip, coin) {
    try {
        await fetch(`/miners/${ip}/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                coin: coin
            })
        });
    } catch (e) {
        alert('Failed to update coin: ' + e.message);
    }
}

// Luck Stats (Calculates odds based on global stats)
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