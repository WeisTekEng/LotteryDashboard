
// AutoTune Details Modal Logic

let minerDetailsInterval = null;
let minerDetailsCountdownInterval = null;
let currentDetailsIp = null;
const DETAILS_REFRESH_RATE = 3;

async function openMinerDetails(ip) {
    const modal = document.getElementById('minerDetailsModal');
    if (!modal) return;

    currentDetailsIp = ip;
    const titleEl = document.getElementById('minerDetailsTitle');
    if (titleEl) titleEl.innerText = `Details for ${ip}`;
    modal.classList.add('active');

    // Ensure tabs are initialized
    if (!document.querySelector('.tab-btn.active')) {
        switchDetailsTab('performance');
    }

    // Initial Load
    await fetchAndRenderDetails();

    // Start Live Refresh
    if (minerDetailsInterval) clearInterval(minerDetailsInterval);
    minerDetailsInterval = setInterval(fetchAndRenderDetails, DETAILS_REFRESH_RATE * 1000);

    // Start Countdown
    startDetailsCountdown();
}

function startDetailsCountdown() {
    if (minerDetailsCountdownInterval) clearInterval(minerDetailsCountdownInterval);

    let seconds = DETAILS_REFRESH_RATE;
    const el = document.getElementById('details-refresh-timer');
    if (el) el.innerText = seconds;

    minerDetailsCountdownInterval = setInterval(() => {
        seconds--;
        if (seconds < 1) seconds = DETAILS_REFRESH_RATE; // It will be reset by fetch anyway, but just in case
        if (el) el.innerText = seconds;
    }, 1000);
}

async function fetchAndRenderDetails() {
    // Reset countdown visual immediately when fetch starts
    const el = document.getElementById('details-refresh-timer');
    if (el) el.innerText = DETAILS_REFRESH_RATE;
    startDetailsCountdown(); // Resync

    if (!currentDetailsIp) return;

    try {
        const res = await fetch(`/api/autotune/${currentDetailsIp}/details`);
        if (!res.ok) throw new Error('Failed to fetch details');
        const data = await res.json();
        const log = data.tuningLog || [];

        // Get current settings for highlighting
        // Prioritize data from the specific API call, fallback to global state
        let currentSettings = data.currentSettings;

        const isValidSetting = (s) => s && (parseFloat(s.voltage || s.volt) > 0 || parseFloat(s.frequency || s.freq) > 0);

        if (!isValidSetting(currentSettings)) {
            // console.log("API missing currentSettings, validation failed. Checking GlobalAutoTuneData.");
            if (window.GlobalAutoTuneData && window.GlobalAutoTuneData.miners) {
                const m = window.GlobalAutoTuneData.miners.find(m => m.ip === currentDetailsIp);
                if (m && isValidSetting(m.currentSettings)) {
                    currentSettings = m.currentSettings;
                }
            }
        }

        // Check for chart functions (loaded from autotune-charts.js)
        if (typeof renderDetailsCharts === 'function') renderDetailsCharts(log);
        if (typeof renderDetailsHeatmap === 'function') renderDetailsHeatmap(log);
        if (typeof renderDetailsGrid === 'function') renderDetailsGrid(log, data.faultHistory, currentSettings, data.currentStats, data.gridHistory);

        renderHistoryTable(log);

    } catch (e) {
        console.error('Error loading details:', e);
    }
}

function closeMinerDetailsModal() {
    const modal = document.getElementById('minerDetailsModal');
    if (modal) modal.classList.remove('active');

    if (minerDetailsInterval) {
        clearInterval(minerDetailsInterval);
        minerDetailsInterval = null;
    }
    if (minerDetailsCountdownInterval) {
        clearInterval(minerDetailsCountdownInterval);
        minerDetailsCountdownInterval = null;
    }
    currentDetailsIp = null;
}

function exportTuningLog() {
    if (!currentDetailsIp) return;
    window.location.href = `/api/autotune/${currentDetailsIp}/export`;
}

function switchDetailsTab(tabName) {
    // Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.style.color = '#94a3b8';
        btn.style.borderBottomColor = 'transparent';
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`tab-btn-${tabName}`);
    if (activeBtn) {
        activeBtn.style.color = '#f8fafc';
        activeBtn.style.borderBottomColor = '#3b82f6';
        activeBtn.classList.add('active');
    }

    // Content
    document.querySelectorAll('.details-tab').forEach(tab => tab.style.display = 'none');
    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) activeTab.style.display = 'block';
}

function renderHistoryTable(log) {
    const tbody = document.getElementById('detailsHistoryTable');
    if (!tbody) return;

    tbody.innerHTML = log.slice().reverse().slice(0, 50).map(e => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 8px; color: #94a3b8;">${new Date(e.timestamp).toLocaleTimeString()}</td>
            <td style="padding: 8px;">${e.action}</td>
            <td style="padding: 8px;">${e.voltage}mV</td>
            <td style="padding: 8px;">${e.freq}MHz</td>
            <td style="padding: 8px; color: #10b981;">${e.hashrate}</td>
        </tr>
    `).join('');
}
