
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
    const btcPriceEl = document.getElementById('btc-price');
    if (btcPriceEl) btcPriceEl.innerText = `$${data.price.toLocaleString()}`;
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
        const btcBlockValueEl = document.getElementById('btc-block-value');
        if (btcBlockValueEl) btcBlockValueEl.innerText = `$${reward.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
