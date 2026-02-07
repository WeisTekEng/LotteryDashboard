// AutoTune Line Charts (Hashrate, Efficiency, Voltage/Freq)

function renderDetailsCharts(log) {
    if (!log || log.length === 0) return;
    const MAX_POINTS = 1000;
    let dataToRender = log;

    if (log.length > MAX_POINTS) {
        const step = Math.ceil(log.length / MAX_POINTS);
        dataToRender = [];
        for (let i = 0; i < log.length; i += step) {
            dataToRender.push(log[i]);
        }
    }

    const labels = dataToRender.map(e => new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    // Helper to create or update chart
    const createOrUpdate = (id, type, config) => {
        const ctx = document.getElementById(id); // get element, not context yet
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) {
            existingChart.data.labels = config.data.labels;
            existingChart.data.datasets = config.data.datasets;
            existingChart.update('none'); // Update without animation for smoothness
        } else {
            new Chart(ctx, { type, ...config });
        }
    };

    // 1. Hashrate & Efficiency
    createOrUpdate('detailsChartHash', 'line', {
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Hashrate (GH/s)',
                    data: dataToRender.map(e => e.hashrate),
                    borderColor: '#10b981',
                    yAxisID: 'y',
                    pointRadius: 0,
                    borderWidth: 2
                },
                {
                    label: 'Efficiency (J/TH)',
                    data: dataToRender.map(e => (e.power && e.hashrate) ? (e.power / (e.hashrate / 1000)).toFixed(2) : 0),
                    borderColor: '#facc15',
                    yAxisID: 'y1',
                    pointRadius: 0,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(255,255,255,0.1)' } },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
            },
            plugins: { legend: { labels: { color: '#cbd5e1' } } }
        }
    });

    // 2. Voltage & Frequency
    createOrUpdate('detailsChartTune', 'line', {
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Frequency (MHz)',
                    data: dataToRender.map(e => e.freq),
                    borderColor: '#3b82f6',
                    yAxisID: 'y',
                    stepped: true,
                    pointRadius: 0,
                    borderWidth: 2
                },
                {
                    label: 'Voltage (mV)',
                    data: dataToRender.map(e => e.voltage),
                    borderColor: '#ef4444',
                    yAxisID: 'y1',
                    stepped: true,
                    pointRadius: 0,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(255,255,255,0.1)' } },
                y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
            },
            plugins: { legend: { labels: { color: '#cbd5e1' } } }
        }
    });
}
