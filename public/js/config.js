
// Global Configuration & Modals

// --- Global Configuration Editor ---
let globalConfig = null;

async function loadGlobalConfig() {
    const container = document.getElementById('config-editor-cards');
    if (!container) return;

    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('Failed to fetch config');
        globalConfig = await res.json();
        renderConfigEditor(globalConfig);
    } catch (e) {
        container.innerHTML = `<div style="color: #ef4444;">Error loading config: ${e.message}</div>`;
    }
}

function getUnitLabel(key) {
    const k = key.toLowerCase();
    if (k.includes('voltage') || k.includes('volts')) return ' (mV)';
    if (k.includes('freq')) return ' (MHz)';
    if (k.includes('interval') || k.includes('timeout') || k.includes('adjust')) return ' (ms)';
    if (k.includes('temp')) return ' (°C)';
    if (k.includes('watts')) return ' (W)';
    if (k.includes('rate')) return ' (ratio 0-1)';
    if (k.includes('efficiency')) return ' (J/TH)';
    return '';
}

function renderConfigEditor(config) {
    const container = document.getElementById('config-editor-cards');
    if (!container) return;
    container.innerHTML = '';

    // Helper to create a setting card
    const createCard = (title, settings, pathPrefix) => {
        const card = document.createElement('div');
        card.className = 'miner-card';
        card.style.height = 'auto';

        card.innerHTML = `
            <div class="card-header" style="padding: 1rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 0;">
                <div>
                    <div class="miner-id" style="font-size: 1.1rem; color: #f8fafc;">${title}</div>
                    <div class="miner-ip" style="font-size: 0.75rem;">${title.includes('Auto-Tune') ? 'Tuning Profile' : 'System Parameters'}</div>
                </div>
            </div>
            <div style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
                ${Object.entries(settings).map(([key, value]) => {
            if (typeof value === 'object' && value !== null) return ''; // Skip nested here
            const unit = getUnitLabel(key);
            return `
                        <div class="form-group" style="margin-bottom: 0;">
                            <label class="form-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;">${key}${unit}</label>
                            <input type="${typeof value === 'number' ? 'number' : 'text'}" 
                                   class="form-input" 
                                   data-path="${pathPrefix}.${key}" 
                                   value="${value}" 
                                   style="background: rgba(0,0,0,0.2); font-size: 0.9rem; padding: 0.5rem;">
                        </div>
                    `;
        }).join('')}
            </div>
        `;
        return card;
    };

    container.appendChild(createCard('Dashboard Network', config.PORTS, 'PORTS'));
    container.appendChild(createCard('Performance Limits', config.LIMITS, 'LIMITS'));

    // AutoTune Profiles
    if (config.AUTOTUNE) {
        for (const [profile, settings] of Object.entries(config.AUTOTUNE)) {
            const title = profile.charAt(0).toUpperCase() + profile.slice(1);
            container.appendChild(createCard(`Auto-Tune: ${title}`, settings, `AUTOTUNE.${profile}`));
        }
    }
}

async function saveGlobalConfig() {
    const inputs = document.querySelectorAll('#config-editor-cards input');
    const newConfig = JSON.parse(JSON.stringify(globalConfig)); // Deep clone

    inputs.forEach(input => {
        const path = input.getAttribute('data-path').split('.');
        let current = newConfig;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        const key = path[path.length - 1];
        const value = input.type === 'number' ? parseFloat(input.value) : input.value;
        current[key] = value;
    });

    const btn = document.querySelector('#settings-view .btn-primary');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Saving...';

    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig)
        });
        const data = await res.json();
        if (data.success) {
            alert(data.restartRequired ? 'Settings saved! A restart is required for port changes.' : 'Settings saved successfully!');
            globalConfig = newConfig;
        } else {
            throw new Error(data.error);
        }
    } catch (e) {
        alert('Failed to save settings: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// --- Miner Configuration Modal ---

async function openConfigModal(ip) {
    document.getElementById('configIp').value = ip;
    document.getElementById('configPool').value = 'Loading...';
    document.getElementById('configPort').value = '';
    document.getElementById('configAddr').value = '';
    document.getElementById('configPass').value = '';
    document.getElementById('configTz').value = '';

    const modal = document.getElementById('configModal');
    modal.classList.add('active');

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

        const knownMiner = miners[minerKey];
        document.getElementById('configCoin').value = (knownMiner && knownMiner.coin) ? knownMiner.coin : 'BTC';
        document.getElementById('configFallbackCoin').value = (knownMiner && knownMiner.fallbackCoin) ? knownMiner.fallbackCoin : '';

        // Populate Auto-Tune settings if available from global data or miner
        // Note: GlobalAutoTuneData is assumed to be available globally or we might need to fetch it
        if (window.GlobalAutoTuneData && window.GlobalAutoTuneData.miners) {
            const atData = window.GlobalAutoTuneData.miners.find(m => m.ip === ip);
            const atMode = atData ? atData.mode : 'off';
            document.getElementById('configAutoTune').value = atMode;

            toggleCostFields();
        }

    } catch (e) {
        alert('Error loading configuration: ' + e.message);
        closeConfigModal();
    }
}

function toggleCostFields() {
    const mode = document.getElementById('configAutoTune').value;
    const fields = document.getElementById('costFields');
    if (fields) {
        fields.style.display = mode === 'cost_sensitive' ? 'block' : 'none';
    }
}

function closeConfigModal() {
    document.getElementById('configModal').classList.remove('active');
}

async function saveConfig(force = false) {
    const autoTuneVal = document.getElementById('configAutoTune').value;

    // Check for aggressive mode warning
    if (autoTuneVal === 'aggressive' && !force) {
        // We need to call the function from autotune.js if available, or define a bridge
        // Since we are in separate files but loaded in global scope...
        if (typeof showAggressiveWarning === 'function') {
            showAggressiveWarning({ type: 'config' });
            return;
        } else if (!confirm("WARNING: Aggressive Mode carries risk of hardware damage. Proceed?")) {
            return;
        }
    }

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
        try {
            await fetch(`/miners/${ip}/metadata`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coin: document.getElementById('configCoin').value,
                    fallbackCoin: document.getElementById('configFallbackCoin').value || null,
                    autoTune: document.getElementById('configAutoTune').value,
                    kwhPrice: document.getElementById('configKwhPrice').value,
                    dailyCostLimit: document.getElementById('configDailyCost').value
                })
            });
        } catch (err) {
            console.error('Failed to save metadata', err);
        }

        btn.disabled = false;
        btn.innerText = originalText;
    }
}
