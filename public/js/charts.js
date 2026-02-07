
// Charting Logic
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
