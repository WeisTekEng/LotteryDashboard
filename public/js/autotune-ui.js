
// AutoTune UI Logic - Main Dashboard

function renderAutoTuneView() {
    if (!autoTuneData) return;

    // Update summary stats
    const totalMinersEl = document.getElementById('autotune-total-miners');
    const limitedMinersEl = document.getElementById('autotune-limited-miners');
    if (totalMinersEl) totalMinersEl.textContent = autoTuneData.totalMiners;
    if (limitedMinersEl) limitedMinersEl.textContent = autoTuneData.limitedMiners;

    // Calculate total faults in last 24h
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    let totalRecentFaults = 0;
    let totalPerformance = 0;
    let performanceCount = 0;

    autoTuneData.miners.forEach(miner => {
        if (miner.faultCount > 0) {
            const recentFaults = (miner.faultHistory || []).filter(f => f.timestamp > dayAgo);
            totalRecentFaults += recentFaults.length;
        }

        // Calculate performance as % of adaptive max
        if (miner.adaptive.maxFreq > 0) {
            const performance = (miner.currentSettings.frequency / miner.adaptive.maxFreq) * 100;
            totalPerformance += performance;
            performanceCount++;
        }
    });

    const totalFaultsEl = document.getElementById('autotune-total-faults');
    const avgPerfEl = document.getElementById('autotune-avg-performance');
    if (totalFaultsEl) totalFaultsEl.textContent = totalRecentFaults;
    if (avgPerfEl) {
        const avgPerf = performanceCount > 0 ? (totalPerformance / performanceCount).toFixed(1) : 0;
        avgPerfEl.textContent = avgPerf + '%';
    }

    // Render miner cards
    const grid = document.getElementById('autotune-miners-grid');
    if (!grid) return;

    if (autoTuneData.miners.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; color: #94a3b8; text-align: center; padding: 2rem;">No AutoTune-enabled miners found</div>';
        return;
    }

    grid.innerHTML = autoTuneData.miners.map(miner => createAutoTuneMinerCard(miner)).join('');
}

function createAutoTuneMinerCard(miner) {
    const isLimited = miner.isLimited;
    // Access global miners object if needed, or assume it's passed/available
    const globalMiners = window.miners || {};
    const minerHashrate = typeof formatHashrate === 'function'
        ? formatHashrate(Object.values(globalMiners).find(m => m.ip === miner.ip)?.hashrate || 0)
        : (Object.values(globalMiners).find(m => m.ip === miner.ip)?.hashrate || 0) + ' GH/s';

    const perfPercent = miner.adaptive.maxFreq > 0
        ? ((miner.currentSettings.frequency / miner.adaptive.maxFreq) * 100).toFixed(1)
        : 0;

    const voltageReduction = miner.config.maxVoltage - miner.adaptive.maxVoltage;
    const freqReduction = miner.config.maxFreq - miner.adaptive.maxFreq;

    const statusColor = isLimited ? '#facc15' : '#10b981';
    const statusText = isLimited ? 'Limited' : 'Optimal';

    const modeColor = miner.mode === 'aggressive' ? '#ef4444' : '#3b82f6';
    const modeText = miner.mode.charAt(0).toUpperCase() + miner.mode.slice(1);

    // Recent faults (last 24h)
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentFaults = (miner.faultHistory || []).filter(f => f.timestamp > dayAgo);

    return `
        <div class="miner-card">
            <div class="card-header" style="margin-bottom: 1rem;">
                <div>
                    <div class="miner-id">${miner.ip}</div>
                    <div class="miner-ip">
                        <span style="background: ${modeColor}20; color: ${modeColor}; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-right: 4px;">${modeText}</span>
                        <span style="background: ${statusColor}20; color: ${statusColor}; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">${statusText}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="openMinerDetails('${miner.ip}')" class="btn-icon" title="View Details & Charts" style="background: rgba(59, 130, 246, 0.2); padding: 6px; border-radius: 6px; border: none; color: #3b82f6; cursor: pointer;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="20" x2="18" y2="10"></line>
                            <line x1="12" y1="20" x2="12" y2="4"></line>
                            <line x1="6" y1="20" x2="6" y2="14"></line>
                        </svg>
                    </button>
                    <button onclick="showFaultHistory('${miner.ip}')" class="btn-icon" title="View Fault History" style="background: rgba(255,255,255,0.1); padding: 6px; border-radius: 6px; border: none; color: white; cursor: pointer;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                    </button>
                    <button onclick="resetAdaptiveLimits('${miner.ip}')" class="btn-icon" title="Reset Limits" style="background: rgba(239,68,68,0.2); padding: 6px; border-radius: 6px; border: none; color: #ef4444; cursor: pointer;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Current Settings -->
            <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Current Settings</div>
                <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
                    <div class="stat-item">
                        <span class="stat-label">Hashrate</span>
                        <span class="stat-value" style="font-size: 1rem; color: #10b981;">${minerHashrate}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Voltage</span>
                        <span class="stat-value" style="font-size: 1rem;">${miner.currentSettings.voltage || '-'} mV</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Frequency</span>
                        <span class="stat-value" style="font-size: 1rem;">${miner.currentSettings.frequency || '-'} MHz</span>
                    </div>
                </div>
                <div style="margin-top: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                        <span style="font-size: 0.75rem; color: #94a3b8;">Performance</span>
                        <span style="font-size: 0.875rem; font-weight: 600; color: ${perfPercent >= 80 ? '#10b981' : perfPercent >= 60 ? '#facc15' : '#ef4444'};">${perfPercent}%</span>
                    </div>
                    <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                        <div style="width: ${perfPercent}%; height: 100%; background: ${perfPercent >= 80 ? '#10b981' : perfPercent >= 60 ? '#facc15' : '#ef4444'}; transition: width 0.3s;"></div>
                    </div>
                </div>
            </div>

            <!-- Cost Stats for Cost Sensitive Mode -->
            ${miner.mode === 'cost_sensitive' ? (() => {
            const globalMiner = Object.values(globalMiners).find(m => m.ip === miner.ip);
            const power = globalMiner ? parseFloat(globalMiner.power) : 0;
            const price = parseFloat(miner.config.kwhPrice) || 0;
            const limit = parseFloat(miner.config.dailyCostLimit) || 0;
            const dailyCost = (power / 1000) * 24 * price;
            const monthlyCost = dailyCost * 30;
            const isOver = dailyCost > limit;
            return `
                <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Cost Constraints</div>
                    <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
                        <div class="stat-item">
                            <span class="stat-label">Price/kWh</span>
                            <span class="stat-value">$${price.toFixed(2)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Daily Limit</span>
                            <span class="stat-value">$${limit.toFixed(2)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Est. Monthly</span>
                            <span class="stat-value" style="color: ${isOver ? '#ef4444' : '#10b981'};">$${monthlyCost.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                `;
        })() : ''}

            <!-- Adaptive Limits -->
            <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Adaptive Limits</div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Max Voltage</span>
                        <span class="stat-value" style="font-size: 1rem; color: ${isLimited ? '#facc15' : '#10b981'};">${miner.adaptive.maxVoltage} mV</span>
                        ${voltageReduction > 0 ? `<span style="font-size: 0.7rem; color: #ef4444;">-${voltageReduction}mV</span>` : ''}
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Max Frequency</span>
                        <span class="stat-value" style="font-size: 1rem; color: ${isLimited ? '#facc15' : '#10b981'};">${miner.adaptive.maxFreq} MHz</span>
                        ${freqReduction > 0 ? `<span style="font-size: 0.7rem; color: #ef4444;">-${freqReduction}MHz</span>` : ''}
                    </div>
                </div>
            </div>

            <!-- Config Limits (for comparison) -->
            <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Config Max (${modeText})</div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Max Voltage</span>
                        <span class="stat-value" style="font-size: 0.9rem; color: #64748b;">${miner.config.maxVoltage} mV</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Max Frequency</span>
                        <span class="stat-value" style="font-size: 0.9rem; color: #64748b;">${miner.config.maxFreq} MHz</span>
                    </div>
                </div>
            </div>

            <!-- Fault Summary -->
            <div>
                <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Fault History</div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Total Faults</span>
                        <span class="stat-value" style="font-size: 1rem; color: ${miner.faultCount > 0 ? '#ef4444' : '#10b981'};">${miner.faultCount}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Last 24h</span>
                        <span class="stat-value" style="font-size: 1rem; color: ${recentFaults.length > 0 ? '#facc15' : '#10b981'};">${recentFaults.length}</span>
                    </div>
                </div>
                ${miner.lastFault ? `
                    <div style="margin-top: 0.75rem; padding: 0.75rem; background: rgba(239,68,68,0.1); border-left: 3px solid #ef4444; border-radius: 4px;">
                        <div style="font-size: 0.7rem; color: #ef4444; font-weight: 600; margin-bottom: 0.25rem;">LAST FAULT</div>
                        <div style="font-size: 0.75rem; color: #f8fafc; margin-bottom: 0.25rem;">${miner.lastFault.reason}</div>
                        <div style="font-size: 0.7rem; color: #94a3b8;">
                            ${new Date(miner.lastFault.timestamp).toLocaleString()}
                            <span style="margin: 0 0.5rem;">•</span>
                            ${miner.lastFault.voltage}mV / ${miner.lastFault.freq}MHz
                        </div>
                    </div>
                ` : '<div style="margin-top: 0.75rem; padding: 0.5rem; text-align: center; color: #10b981; font-size: 0.8rem; background: rgba(16,185,129,0.1); border-radius: 4px;">✓ No faults recorded</div>'}
            </div>
        </div>
    `;
}

// Modal Logic for Aggressive Warning
let pendingAggressiveAction = null;

function showAggressiveWarning(action) {
    pendingAggressiveAction = action;
    const modal = document.getElementById('aggressiveWarningModal');
    if (modal) modal.classList.add('active');
}

function closeAggressiveWarning() {
    const modal = document.getElementById('aggressiveWarningModal');
    if (modal) modal.classList.remove('active');
    pendingAggressiveAction = null;
}

function confirmAggressiveMode() {
    console.log('confirmAggressiveMode called');
    const action = pendingAggressiveAction; // Capture action before closing
    closeAggressiveWarning();

    if (!action) {
        console.error('No pending action');
        return;
    }

    if (action.type === 'inline') {
        executeToggleAutotune(action.ip, 'aggressive');
    } else if (action.type === 'config') {
        saveConfig(true); // Helper to bypass check
    }
}

function cancelAggressiveMode() {
    closeAggressiveWarning();
    // Refresh to revert UI selection
    if (typeof refreshAutoTuneData === 'function') refreshAutoTuneData();
}

async function toggleAutotune(ip, mode) {
    if (mode === 'aggressive') {
        showAggressiveWarning({ type: 'inline', ip });
        return;
    }
    executeToggleAutotune(ip, mode);
}

async function executeToggleAutotune(ip, mode) {
    // Apply mode immediately
    try {
        await fetch(`/miners/${ip}/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                autoTune: mode
            })
        });

        // Refresh to show update
        if (typeof refreshAutoTuneData === 'function') refreshAutoTuneData();

    } catch (e) {
        alert('Failed to update Auto-Tune mode: ' + e.message);
    }
}

async function saveCostFromInline(ip) {
    const priceInput = document.getElementById(`cost-kwh-${ip}`);
    const limitInput = document.getElementById(`cost-limit-${ip}`);

    if (!priceInput || !limitInput) return;

    try {
        await fetch(`/miners/${ip}/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                autoTune: 'cost_sensitive',
                kwhPrice: priceInput.value,
                dailyCostLimit: limitInput.value
            })
        });

        // Visual feedback
        priceInput.style.borderColor = '#10b981';
        limitInput.style.borderColor = '#10b981';
        setTimeout(() => {
            if (priceInput) priceInput.style.borderColor = 'rgba(255,255,255,0.1)';
            if (limitInput) limitInput.style.borderColor = 'rgba(255,255,255,0.1)';
        }, 1000);

    } catch (e) {
        console.error('Failed to save cost settings', e);
        alert('Failed to save settings');
    }
}

async function resetAdaptiveLimits(ip) {
    if (!confirm(`Reset adaptive limits for ${ip}?\n\nThis will restore config max limits and allow the miner to re-learn its capabilities.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/autotune/${ip}/adaptive-limits/reset`, {
            method: 'POST'
        });

        if (!res.ok) throw new Error('Failed to reset limits');

        const data = await res.json();
        alert(`Limits reset successfully!\n\nNew limits: ${data.limits.maxVoltage}mV / ${data.limits.maxFreq}MHz`);

        // Refresh the view
        if (typeof refreshAutoTuneData === 'function') refreshAutoTuneData();
    } catch (e) {
        alert('Error resetting limits: ' + e.message);
    }
}

async function showFaultHistory(ip) {
    try {
        const res = await fetch(`/api/autotune/${ip}/adaptive-limits`);
        if (!res.ok) throw new Error('Failed to fetch fault history');

        const data = await res.json();
        const faults = data.adaptive.faultHistory || [];

        if (faults.length === 0) {
            alert(`No fault history for ${ip}`);
            return;
        }

        // Create a formatted display
        let message = `Fault History for ${ip}\n`;
        message += `${'='.repeat(60)}\n\n`;

        faults.reverse().forEach((fault, idx) => {
            const date = new Date(fault.timestamp).toLocaleString();
            message += `${idx + 1}. ${date}\n`;
            message += `   Reason: ${fault.reason}\n`;
            message += `   Settings: ${fault.voltage}mV / ${fault.freq}MHz\n`;
            message += `   New Limits: ${fault.newLimits.maxVoltage}mV / ${fault.newLimits.maxFreq}MHz\n\n`;
        });

        // For now, use alert
        alert(message);
        console.log('Fault History for', ip);
        console.table(faults.map(f => ({
            Date: new Date(f.timestamp).toLocaleString(),
            Reason: f.reason,
            Voltage: f.voltage + 'mV',
            Frequency: f.freq + 'MHz',
            'New Max V': f.newLimits.maxVoltage + 'mV',
            'New Max F': f.newLimits.maxFreq + 'MHz'
        })));

    } catch (e) {
        alert('Error loading fault history: ' + e.message);
    }
}
