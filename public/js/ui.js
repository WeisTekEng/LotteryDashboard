function createCard(key) {
    const div = document.createElement('div');
    div.className = 'miner-card';
    div.id = `card-${key}`;
    return div;
}

function updateCardHTML(miner) {
    const tempClass = parseFloat(miner.temp) > 70 ? 'temp-high' : '';
    const displayName = (miner.miner && miner.miner !== 'Unknown') ? miner.miner : (miner.id || 'Unknown');
    const hashrateDisplay = formatHashrate(miner.hashrate);

    let actionBtn;
    const isBCH = miner.coin === 'BCH';
    const coinBadge = isBCH
        ? `<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-right: 8px;">BCH</span>`
        : `<span style="background: rgba(247, 147, 26, 0.2); color: #f7931a; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-right: 8px;">BTC</span>`;

    if (miner.source === 'http') {
        actionBtn = `
        <a href="http://${miner.ip}" target="_blank" class="btn-icon" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; display: flex; align-items: center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
        </a>`;
    } else {
        actionBtn = `
        <button onclick="openConfigModal('${miner.ip}')" class="btn-icon" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        </button>`;
    }

    const currentCoin = miner.coin || 'BTC';
    const autoTuneMode = miner.autoTune || 'off';

    const autoTuneSelector = miner.source === 'http' ? `
        <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                <label style="font-size: 0.75rem; color: #94a3b8; white-space: nowrap;">Auto-Tune:</label>
                <select onchange="toggleAutotune('${miner.ip}', this.value)" style="background: rgba(15, 23, 42, 0.8); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 2px 4px; font-size: 0.75rem; cursor: pointer; flex: 1;">
                    <option value="off" ${autoTuneMode === 'off' ? 'selected' : ''}>Off</option>
                    <option value="conservative" ${autoTuneMode === 'conservative' ? 'selected' : ''}>Conservative</option>
                    <option value="aggressive" ${autoTuneMode === 'aggressive' ? 'selected' : ''}>Aggressive (Warning!)</option>
                </select>
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <label style="font-size: 0.75rem; color: #94a3b8;">Coin:</label>
                    <select onchange="updateMinerCoin('${miner.ip}', this.value)" style="background: rgba(15, 23, 42, 0.8); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 2px 4px; font-size: 0.75rem; cursor: pointer;">
                        <option value="BTC" ${currentCoin === 'BTC' ? 'selected' : ''}>BTC</option>
                        <option value="BCH" ${currentCoin === 'BCH' ? 'selected' : ''}>BCH</option>
                    </select>
                </div>
            </div>
            ${autoTuneMode === 'aggressive' ? '<div style="color: #ef4444; font-size: 0.7rem; font-weight: 700; text-align: center; width: 100%; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); padding: 4px; border-radius: 4px;">⚠️ RISK OF HARDWARE DAMAGE</div>' : ''}
        </div>
    ` : '';

    return `
                <div class="card-header">
                    <div style="flex-grow: 1; min-width: 0;">
                        <div class="miner-id" style="display: flex; align-items: center; gap: 0.5rem;">
                            ${coinBadge}
                            <span style="font-weight: 600; color: #f8fafc; font-size: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName}</span>
                        </div>
                        <div class="miner-ip">${miner.ip}</div>
                        ${autoTuneSelector}
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; align-self: flex-start;">
                        ${actionBtn}
                        <div class="status-badge">
                            <span class="status-dot"></span> Online
                        </div>
                    </div>
                </div>
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
    const sortedKeys = Object.keys(miners).sort();

    sortedKeys.forEach(key => {
        const miner = miners[key];
        totalHash += parseFloat(miner.hashrate) || 0;

        const targetGrid = miner.source === 'http' ? otherGrid : nerdGrid;
        let card = document.getElementById(`card-${key}`);

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

    const currentIds = new Set(sortedKeys.map(k => `card-${k}`));
    [nerdGrid, otherGrid].forEach(grid => {
        Array.from(grid.children).forEach(child => {
            if (!currentIds.has(child.id)) {
                child.remove();
            }
        });
    });

    if (nerdHeader) {
        const hasNerdMiners = nerdGrid.children.length > 0;
        nerdHeader.style.display = hasNerdMiners ? 'flex' : 'none';
        nerdGrid.style.display = hasNerdMiners ? '' : 'none';
    }

    totalHashEl.innerHTML = `${formatHashrate(totalHash)} Total`;
    currentFleetHash = totalHash * 1000;
    updateLuckStats();
}
