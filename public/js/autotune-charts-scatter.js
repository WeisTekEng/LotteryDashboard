// AutoTune Scatter/Heatmap (Stability)

function renderDetailsHeatmap(log) {
    const ctx = document.getElementById('detailsChartHeatmap');
    if (!ctx) return;

    const stablePoints = [];
    const unstablePoints = [];

    // Downsample for Scatter Plot (Limit to ~1000 points)
    const MAX_POINTS = 1000;
    let dataToProcess = log;
    if (log.length > MAX_POINTS) {
        const step = Math.ceil(log.length / MAX_POINTS);
        dataToProcess = [];
        for (let i = 0; i < log.length; i += step) {
            dataToProcess.push(log[i]);
        }
    }

    dataToProcess.forEach(e => {
        if (!e.voltage || !e.freq) return;
        const point = { x: e.freq, y: e.voltage, action: e.action, time: e.timestamp };

        if (e.action === 'maintain' || e.action === 'stabilizing') {
            stablePoints.push(point);
        } else {
            unstablePoints.push(point);
        }
    });

    const existingChart = Chart.getChart(ctx);

    if (existingChart) {
        if (existingChart.data && existingChart.data.datasets && existingChart.data.datasets.length >= 2) {
            existingChart.data.datasets[0].data = stablePoints;
            existingChart.data.datasets[1].data = unstablePoints;
            existingChart.update();
            return;
        } else {
            existingChart.destroy();
        }
    }

    new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Stable',
                    data: stablePoints,
                    backgroundColor: '#10b981', // Green
                    borderColor: '#10b981',
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Adjustment/Fault',
                    data: unstablePoints,
                    backgroundColor: '#ef4444', // Red
                    borderColor: '#ef4444',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    min: 400,
                    max: 1200,
                    title: { display: true, text: 'Frequency (MHz)', color: '#94a3b8' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                },
                y: {
                    min: 941,
                    max: 1350,
                    title: { display: true, text: 'Voltage (mV)', color: '#94a3b8' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            },
            plugins: {
                legend: { labels: { color: '#cbd5e1' } },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const p = context.raw;
                            return `${p.action}: ${p.y}mV @ ${p.x}MHz`;
                        }
                    }
                }
            }
        }
    });
}
