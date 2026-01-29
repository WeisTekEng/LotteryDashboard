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

function formatDifficulty(val) {
    if (val >= 1e18) return (val / 1e18).toFixed(2) + ' E';
    if (val >= 1e15) return (val / 1e15).toFixed(2) + ' P';
    if (val >= 1e12) return (val / 1e12).toFixed(2) + ' T';
    if (val >= 1e9) return (val / 1e9).toFixed(2) + ' G';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + ' M';
    if (val >= 1e3) return (val / 1e3).toFixed(2) + ' k';
    return val.toFixed(2);
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
