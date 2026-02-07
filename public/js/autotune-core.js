
// AutoTune Core Logic - State & Data Fetching

let autoTuneData = null;
let autoTuneRefreshInterval = null;
let autoTuneCountdownInterval = null;
const AUTOTUNE_REFRESH_SECONDS = 10;
// Global variable to share detailed autotune data if needed by config modal
window.GlobalAutoTuneData = null;

async function refreshAutoTuneData() {
    try {
        const res = await fetch('/api/autotune/adaptive-limits/summary');
        if (!res.ok) throw new Error('Failed to fetch AutoTune data');
        autoTuneData = await res.json();
        window.GlobalAutoTuneData = autoTuneData; // Expose globally

        if (typeof renderAutoTuneView === 'function') {
            renderAutoTuneView();
        }

        // Reset countdown
        resetAutoTuneCountdown();
    } catch (e) {
        console.error('AutoTune data fetch error:', e);
        const grid = document.getElementById('autotune-miners-grid');
        if (grid) {
            grid.innerHTML = `<div style="grid-column: 1 / -1; color: #ef4444; text-align: center; padding: 2rem;">Error loading data: ${e.message}</div>`;
        }
    }
}

function startAutoTuneRefresh() {
    // Clear any existing intervals
    stopAutoTuneRefresh();

    // Start refresh interval
    autoTuneRefreshInterval = setInterval(() => {
        refreshAutoTuneData();
    }, AUTOTUNE_REFRESH_SECONDS * 1000);

    // Start countdown
    resetAutoTuneCountdown();
}

function stopAutoTuneRefresh() {
    if (autoTuneRefreshInterval) {
        clearInterval(autoTuneRefreshInterval);
        autoTuneRefreshInterval = null;
    }
    if (autoTuneCountdownInterval) {
        clearInterval(autoTuneCountdownInterval);
        autoTuneCountdownInterval = null;
    }
}

function resetAutoTuneCountdown() {
    // Clear existing countdown
    if (autoTuneCountdownInterval) {
        clearInterval(autoTuneCountdownInterval);
    }

    let secondsLeft = AUTOTUNE_REFRESH_SECONDS;
    const countdownEl = document.getElementById('autotune-countdown');

    if (countdownEl) {
        countdownEl.textContent = secondsLeft;

        autoTuneCountdownInterval = setInterval(() => {
            secondsLeft--;
            if (countdownEl) {
                countdownEl.textContent = secondsLeft;
            }
            if (secondsLeft <= 0) {
                clearInterval(autoTuneCountdownInterval);
            }
        }, 1000);
    }
}
