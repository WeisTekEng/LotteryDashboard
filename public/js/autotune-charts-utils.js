// AutoTune Chart Utilities & Tooltips

let tooltipEl = null;

function getTooltip() {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.style.position = 'fixed';
        tooltipEl.style.background = 'rgba(15, 23, 42, 0.95)';
        tooltipEl.style.border = '1px solid #334155';
        tooltipEl.style.color = '#f8fafc';
        tooltipEl.style.padding = '8px';
        tooltipEl.style.borderRadius = '4px';
        tooltipEl.style.pointerEvents = 'none';
        tooltipEl.style.fontSize = '12px';
        tooltipEl.style.zIndex = '9999';
        tooltipEl.style.display = 'none';
        tooltipEl.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}

function showTooltip(x, y, html) {
    const el = getTooltip();
    el.innerHTML = html;
    el.style.display = 'block';
    // Offset slightly to not cover cursor
    el.style.left = (x + 15) + 'px';
    el.style.top = (y + 15) + 'px';
}

function hideTooltip() {
    const el = getTooltip();
    el.style.display = 'none';
}
