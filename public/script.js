const socket = io();
const nerdGrid = document.getElementById('nerdminer-grid');
const nerdHeader = document.getElementById('nerdminer-header');
const otherGrid = document.getElementById('other-miner-grid');
const totalHashEl = document.getElementById('total-hashrate');

const miners = {};
let currentFleetHash = 0;
let currentNetworkHash = 0;
let btcStats = {};
let bchStats = {};

function formatTime(seconds) {
    if (seconds >= 86400) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${d}d ${h}h ${m}m`;
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

function formatCount(val) {
    if (val >= 1e12) return (val / 1e12).toFixed(2) + ' T';
    if (val >= 1e9) return (val / 1e9).toFixed(2) + ' B';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + ' M';
    if (val >= 1e3) return (val / 1e3).toFixed(2) + ' k';
    return Math.floor(val).toLocaleString();
}

function createCard(key) {
    const div = document.createElement('div');
    div.className = 'miner-card';
    div.id = `card-${key}`;
    return div;
}

function formatHashrate(strValue) {
    const val = parseFloat(strValue);
    if (isNaN(val)) return '0 <span style="font-size: 0.8rem">H/s</span>';

    if (val >= 1e18) return `${(val / 1e18).toFixed(3)} <span style="font-size: 0.8rem">ZH/s</span>`;
    if (val >= 1e15) return `${(val / 1e15).toFixed(2)} <span style="font-size: 0.8rem">EH/s</span>`;
    if (val >= 1e12) return `${(val / 1e12).toFixed(2)} <span style="font-size: 0.8rem">PH/s</span>`;
    if (val >= 1e9) return `${(val / 1e9).toFixed(2)} <span style="font-size: 0.8rem">TH/s</span>`;
    if (val >= 1e6) return `${(val / 1e6).toFixed(2)} <span style="font-size: 0.8rem">GH/s</span>`;
    if (val >= 1e3) return `${(val / 1e3).toFixed(2)} <span style="font-size: 0.8rem">MH/s</span>`;
    if (val >= 1) return `${val.toFixed(2)} <span style="font-size: 0.8rem">KH/s</span>`;
    return `${(val * 1000).toFixed(0)} <span style="font-size: 0.8rem">H/s</span>`;
}

function updateCardHTML(miner) {
    const tempClass = parseFloat(miner.temp) > 70 ? 'temp-high' : '';
    const displayName = (miner.miner && miner.miner !== 'Unknown') ? miner.miner : (miner.id || 'Unknown');
    const hashrateDisplay = formatHashrate(miner.hashrate);

    // Config Button vs External Link
    let actionBtn;

    // Coin Badge
    const isBCH = miner.coin === 'BCH';
    const coinBadge = isBCH
        ? `<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-right: 8px;">BCH</span>`
        : `<span style="background: rgba(247, 147, 26, 0.2); color: #f7931a; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-right: 8px;">BTC</span>`;

    if (miner.source === 'http') {
        // Bitaxe/HTTP Miner: Just external link in header
        actionBtn = `
        <a href="http://${miner.ip}" target="_blank" class="btn-icon" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; display: flex; align-items: center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
        </a>`;
    } else {
        // NerdMiner: Config Modal
        actionBtn = `
        <button onclick="openConfigModal('${miner.ip}')" class="btn-icon" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        </button>`;
    }

    // Coin selector for Bitaxe (appears below name)
    const currentCoin = miner.coin || 'BTC';
    const coinSelector = miner.source === 'http' ? `
        <div style="margin-bottom: 0.5rem;">
            <label style="font-size: 0.75rem; color: #94a3b8; margin-right: 0.5rem;">Coin:</label>
            <select onchange="updateMinerCoin('${miner.ip}', this.value)" style="background: rgba(15, 23, 42, 0.8); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 3px 6px; font-size: 0.8rem; cursor: pointer;">
                <option value="BTC" ${currentCoin === 'BTC' ? 'selected' : ''}>BTC</option>
                <option value="BCH" ${currentCoin === 'BCH' ? 'selected' : ''}>BCH</option>
            </select>
        </div>` : '';

    return `
                <div class="card-header">
                    <div style="flex-grow: 1; min-width: 0;">
                        <div class="miner-id" style="display: flex; align-items: center; flex-wrap: nowrap;">
                            ${coinBadge}
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayName}</span>
                        </div>
                        <div class="miner-ip">${miner.ip}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
                        ${actionBtn}
                        <div class="status-badge">
                            <span class="status-dot"></span> Online
                        </div>
                    </div>
                </div>
                ${coinSelector}
                <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 0.8rem; color: #94a3b8;">Pool: <span style="color: #f8fafc;">${miner.pool || 'Unknown'}</span> ${miner.usingFallback ? '<span style="color: #ef4444; font-weight: bold; font-size: 0.7rem;">(Fallback)</span>' : ''}</div>
                    ${miner.address ? `<div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem;">Addr: <span style="color: #f8fafc; font-family: monospace;">...${miner.address.split('.')[0].slice(-8)}</span></div>` : ''}
                    ${(miner.miner && miner.miner !== 'Unknown') ? `<div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem;">ID: <span style="font-family: monospace;">${miner.id}</span></div>` : ''}
                    ${miner.chipInfo ? `<div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem;">Chip: <span style="color: #10b981;">${miner.chipInfo}</span></div>` : ''}
                </div>
                <div class="stats-grid">
                    <div class="stat-item" style="grid-column: span 2;">
                        <span class="stat-label">Hashrate</span>
                        <span class="stat-value hashrate">${hashrateDisplay}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Valid Shares</span>
                        <span class="stat-value">${miner.valid}</span>
                    </div>
                    ${miner.source === 'http' ? '' : `<div class="stat-item">
                        <span class="stat-label">Templates</span>
                        <span class="stat-value">${formatCount(parseFloat(miner.templates) || 0)}</span>
                    </div>`}
                    <div class="stat-item">
                        <span class="stat-label">Best Diff</span>
                        <span class="stat-value">
                            ${miner.bestSessionDiff ? formatDifficulty(miner.bestSessionDiff) : formatDifficulty(parseFloat(miner.bestDiff) || 0)}
                            ${miner.bestSessionDiff ? `<span style="font-size: 0.8rem; color: #94a3b8;"> / ${formatDifficulty(parseFloat(miner.bestDiff) || 0)}</span>` : ''}
                        </span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Temp (Core/VRM)</span>
                        <span class="stat-value ${tempClass}">
                            ${miner.temp}°C
                            ${miner.vrTemp ? `<span style="font-size: 0.8rem; color: #94a3b8;"> / ${miner.vrTemp}°C</span>` : ''}
                        </span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Uptime</span>
                        <span class="stat-value">${formatTime(miner.uptime)}</span>
                    </div>
                    
                    ${miner.source === 'http' ? `
                    <div style="grid-column: span 2; width: 100%; height: 1px; background: rgba(255,255,255,0.05); margin: 0.5rem 0;"></div>
                    
                    <div class="stat-item">
                        <span class="stat-label">Frequency</span>
                        <span class="stat-value">${miner.freq ? miner.freq + ' MHz' : '-'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Core Voltage</span>
                        <span class="stat-value">${miner.vCore ? miner.vCore + ' mV' : '-'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Power</span>
                        <span class="stat-value" style="color: #facc15;">${miner.power ? miner.power + ' W' : '-'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Efficiency</span>
                        <span class="stat-value">${(miner.power && miner.hashrate > 0) ? (miner.power / (miner.hashrate / 1000000000)).toFixed(2) + ' J/TH' : '-'}</span>
                    </div>
                    <div class="stat-item" style="grid-column: span 2;">
                        <span class="stat-label">Input Voltage</span>
                        <span class="stat-value">${miner.inputVoltage ? miner.inputVoltage + ' V' : '-'}</span>
                    </div>
                    ` : ''}
                </div>
            `;
}

function render() {
    let totalHash = 0;

    // Sort miners by IP or ID
    const sortedKeys = Object.keys(miners).sort();

    sortedKeys.forEach(key => {
        const miner = miners[key];
        totalHash += parseFloat(miner.hashrate) || 0;

        const targetGrid = miner.source === 'http' ? otherGrid : nerdGrid;
        let card = document.getElementById(`card-${key}`);

        // If card exists but is in the wrong grid (unlikely but possible if type changed? No, but rigorous)
        if (card && card.parentElement !== targetGrid) {
            card.remove();
            card = null;
        }

        if (!card) {
            card = createCard(key);
            targetGrid.appendChild(card);
        }
        card.innerHTML = updateCardHTML(miner);
    });

    // Remove old cards from both grids
    const currentIds = new Set(sortedKeys.map(k => `card-${k}`));
    [nerdGrid, otherGrid].forEach(grid => {
        Array.from(grid.children).forEach(child => {
            if (!currentIds.has(child.id)) {
                child.remove();
            }
        });
    });


    // Toggle NerdMiners visibility
    if (nerdHeader) {
        const hasNerdMiners = nerdGrid.children.length > 0;
        nerdHeader.style.display = hasNerdMiners ? 'flex' : 'none';
        nerdGrid.style.display = hasNerdMiners ? '' : 'none';
    }

    totalHashEl.innerHTML = `${formatHashrate(totalHash)} Total`;

    currentFleetHash = totalHash * 1000; // KH/s -> H/s
    updateLuckStats();
}

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

    const diffVal = data.difficulty; // Now validated
    let diffStr = diffVal.toLocaleString();
    if (diffVal > 1e12) diffStr = (diffVal / 1e12).toFixed(2) + ' T';
    document.getElementById('btc-diff').innerText = diffStr;

    // Use pre-fetched network hashrate (convert H/s to KH/s)
    currentNetworkHash = data.networkHashrate;
    document.getElementById('btc-network-hash').innerHTML = formatHashrate(data.networkHashrate / 1000);

    if (data.fees) {
        document.getElementById('btc-fees').innerHTML = `
                    <span style="color: #ef4444">${data.fees.fastestFee}</span> / 
                    <span style="color: #f7931a">${data.fees.hourFee}</span>
                `;
    }




    if (data.price) {
        btcStats = data; // Store globally
        const reward = 3.125 * data.price;
        document.getElementById('btc-block-value').innerText = `$${reward.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }

    updateLuckStats();
});

socket.on('bch_stats', (data) => {
    bchStats = data;
    const card = document.getElementById('bch-card');
    if (card) {
        card.style.display = 'block'; // Always show if we have data? Or only if we have BCH miners?
        // Let's keep it visible if we have data for now, user asked for "another card".
    }

    if (data.price) document.getElementById('bch-price').innerText = `$${data.price.toLocaleString()}`;
    if (data.height) document.getElementById('bch-height').innerText = data.height.toLocaleString();

    // Format difficulty
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
        // formatHashrate expects KH/s, input is H/s
        document.getElementById('bch-network-hash').innerHTML = formatHashrate(data.networkHashrate / 1000);
    }
});

// Update updateLuckStats to use globals
function updateLuckStats() {
    // Calculate Fleet Hashrates per coin
    let totalBTC = 0;
    let totalBCH = 0;

    // Also track best diff overall?
    let maxDiff = 0;

    for (const key in miners) {
        const d = parseFloat(miners[key].bestDiff) || 0;
        if (d > maxDiff) maxDiff = d;

        const h = (parseFloat(miners[key].hashrate) || 0) * 1000; // KH/s -> H/s
        if (miners[key].coin === 'BCH') {
            totalBCH += h;
        } else {
            totalBTC += h;
        }
    }

    const bestDiffEl = document.getElementById('best-diff-overall');
    if (bestDiffEl) bestDiffEl.innerText = formatDifficulty(maxDiff);

    // --- BTC Stats ---
    if (btcStats && btcStats.difficulty && totalBTC > 0) {
        // Prob per block = Fleet / (Difficulty * 2^32) ??? No, Network Hashrate approach is better.
        // Or Prob = Fleet / NetworkHash
        const probPerBlock = totalBTC / (btcStats.networkHashrate || 1); // Avoid div0
        const blocksPerDay = 144;
        const probPerDay = 1 - Math.pow(1 - probPerBlock, blocksPerDay);

        document.getElementById('btc-daily-chance').innerText = (probPerDay * 100).toFixed(9) + '%';

        const daysToWin = (1 / probPerBlock) / blocksPerDay;
        const yearsToWin = daysToWin / 365;
        let timeString = yearsToWin > 1000 ? `${(yearsToWin / 1000).toFixed(1)}k Years` : (yearsToWin > 1 ? `${yearsToWin.toFixed(1)} Years` : `${daysToWin.toFixed(1)} Days`);
        document.getElementById('btc-time-to-win').innerText = `Est: ${timeString}`;
    } else {
        document.getElementById('btc-daily-chance').innerText = '-';
        document.getElementById('btc-time-to-win').innerText = '-';
    }

    // --- BCH Stats ---
    // If we have stats, use them. If totalBCH is 0, we can still show 0 chance.
    if (bchStats && bchStats.difficulty && totalBCH > 0) {
        // BCH Network Hashrate might be in bchStats.networkHashrate 
        // If not available (e.g. Mempool BCH API issues), estimating from Difficulty is: Diff * 2^32 / 600
        const netHash = bchStats.networkHashrate || (bchStats.difficulty * Math.pow(2, 32) / 600);

        const probPerBlock = totalBCH / netHash;
        const blocksPerDay = 144;
        const probPerDay = 1 - Math.pow(1 - probPerBlock, blocksPerDay);

        document.getElementById('bch-daily-chance').innerText = (probPerDay * 100).toFixed(9) + '%';

        const daysToWin = (1 / probPerBlock) / blocksPerDay;
        const yearsToWin = daysToWin / 365;
        let timeString = yearsToWin > 1000 ? `${(yearsToWin / 1000).toFixed(1)}k Years` : (yearsToWin > 1 ? `${yearsToWin.toFixed(1)} Years` : `${daysToWin.toFixed(1)} Days`);
        document.getElementById('bch-time-to-win').innerText = `Est: ${timeString}`;

        // Reward
        if (bchStats.price) {
            // BCH Block Reward is currently 3.125 BCH
            const reward = 3.125 * bchStats.price;
            document.getElementById('bch-block-value').innerText = `$${reward.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        }
    } else {
        document.getElementById('bch-daily-chance').innerText = '-';
        document.getElementById('bch-time-to-win').innerText = '-';
    }
}

// Update miner coin type from dropdown
async function updateMinerCoin(ip, coin) {
    try {
        await fetch(`/miners/${ip}/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coin: coin })
        });
        console.log(`Updated ${ip} to ${coin}`);
    } catch (err) {
        console.error('Failed to update miner coin:', err);
        alert('Failed to update coin setting');
    }
}

// Navigation Logic
function toggleMenu() {
    const menu = document.getElementById('nav-menu');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

function switchView(viewName) {
    const statsView = document.getElementById('stats-view');
    const minersView = document.getElementById('miners-view');
    const menu = document.getElementById('nav-menu');

    if (viewName === 'stats') {
        statsView.style.display = 'block';
        minersView.style.display = 'none';
        document.title = 'NerdMiner Stats';
    } else {
        statsView.style.display = 'none';
        minersView.style.display = 'block';
        document.title = 'Miners Pool';
    }
    menu.style.display = 'none';
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('nav-menu');
    const btn = document.querySelector('header button');
    if (menu.style.display === 'block' && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.style.display = 'none';
    }
});

// Chart.js Setup
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
    // Handle both legacy (single val) and new (obj) formats
    const labels = history.map(p => new Date(p.timestamp).toLocaleTimeString());

    // Map data points
    const btcData = history.map(p => (p.btc !== undefined) ? p.btc : (p.hashrate || 0));
    const bchData = history.map(p => (p.bch !== undefined) ? p.bch : 0);

    hashrateChart.data.labels = labels;
    hashrateChart.data.datasets[0].data = btcData;
    hashrateChart.data.datasets[1].data = bchData;
    hashrateChart.update();

    // Calculate Averages
    if (labels.length > 0) {
        const sumBTC = btcData.reduce((a, b) => a + b, 0);
        const avgBTC = sumBTC / btcData.length;

        const sumBCH = bchData.reduce((a, b) => a + b, 0);
        const avgBCH = sumBCH / bchData.length;

        // Display Combined or specific? Let's display "BTC | BCH"
        document.getElementById('hourly-avg').innerHTML =
            `<span style="color: #f7931a; font-size: 1.5rem;">${formatHashrate(avgBTC)}</span> <span style="font-size: 1rem; color: #94a3b8;">/</span> <span style="color: #10b981; font-size: 1.5rem;">${formatHashrate(avgBCH)}</span>`;
    }
}

socket.on('init_history', (history) => {
    updateGraph(history);
    updateRollingAverages();
});

socket.on('history_update', (point) => {
    // Add new point
    hashrateChart.data.labels.push(new Date(point.timestamp).toLocaleTimeString());

    const btcVal = (point.btc !== undefined) ? point.btc : (point.hashrate || 0);
    const bchVal = (point.bch !== undefined) ? point.bch : 0;

    hashrateChart.data.datasets[0].data.push(btcVal);
    hashrateChart.data.datasets[1].data.push(bchVal);

    // Limit to 1440 points (24h)
    if (hashrateChart.data.labels.length > 1440) {
        hashrateChart.data.labels.shift();
        hashrateChart.data.datasets[0].data.shift();
        hashrateChart.data.datasets[1].data.shift();
    }
    hashrateChart.update();

    // Re-calculate Average (Simplified for visual update freq)
    const data0 = hashrateChart.data.datasets[0].data;
    const avg0 = data0.reduce((a, b) => a + b, 0) / data0.length;

    const data1 = hashrateChart.data.datasets[1].data;
    const avg1 = data1.reduce((a, b) => a + b, 0) / data1.length;

    document.getElementById('hourly-avg').innerHTML =
        `<span style="color: #f7931a; font-size: 1.5rem;">${formatHashrate(avg0)}</span> <span style="font-size: 1rem; color: #94a3b8;">/</span> <span style="color: #10b981; font-size: 1.5rem;">${formatHashrate(avg1)}</span>`;

    // Update Rolling Averages (5m, 1h, 24h) - Using Total (BTC+BCH)
    updateRollingAverages();
});

function updateRollingAverages() {
    // Collect data from graph datasets (aligned with time)
    const btcData = hashrateChart.data.datasets[0].data;
    const bchData = hashrateChart.data.datasets[1].data;

    if (btcData.length === 0) return;

    // Combine for Total Fleet Power
    const totalData = btcData.map((val, i) => val + (bchData[i] || 0));
    const totalLen = totalData.length;

    // Helper for avg of last N items
    const getAvg = (minutes) => {
        if (totalLen === 0) return 0;
        const count = Math.min(minutes, totalLen);
        const slice = totalData.slice(totalLen - count); // Take last count
        const sum = slice.reduce((a, b) => a + b, 0);
        return sum / count;
    };

    document.getElementById('avg-5m').innerHTML = formatHashrate(getAvg(5));
    document.getElementById('avg-1h').innerHTML = formatHashrate(getAvg(60));
    document.getElementById('avg-24h').innerHTML = formatHashrate(getAvg(1440));
}

function formatDifficulty(val) {
    if (val >= 1e18) return (val / 1e18).toFixed(2) + ' E';
    if (val >= 1e15) return (val / 1e15).toFixed(2) + ' P';
    if (val >= 1e12) return (val / 1e12).toFixed(2) + ' T';
    if (val >= 1e9) return (val / 1e9).toFixed(2) + ' G';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + ' M';
    if (val >= 1e3) return (val / 1e3).toFixed(2) + ' k';
    return val.toFixed(2);
}

// Copy BTC address function
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
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy address. Please copy manually.');
    });
}

// Configuration Modal Logic
const modal = document.getElementById('configModal');

async function openConfigModal(ip) {
    document.getElementById('configIp').value = ip;
    document.getElementById('configPool').value = 'Loading...';
    document.getElementById('configPort').value = '';
    document.getElementById('configAddr').value = '';
    document.getElementById('configPass').value = '';
    document.getElementById('configTz').value = '';

    modal.classList.add('active');

    // Find miner name
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

        // Load coin setting from miner object in memory (pushed from server metadata)
        // We don't get this from the /config endpoint (which is proxy to miner).
        // We get it from the 'miners' global object.
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
        // Also save metadata (Coin Type) to Dashboard Server
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

// Close modal when clicking outside
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeConfigModal();
});

// Add Device Modal Logic
const addModal = document.getElementById('addDeviceModal');

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

addModal.addEventListener('click', (e) => {
    if (e.target === addModal) closeAddModal();
});
