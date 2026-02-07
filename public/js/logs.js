
// Logging Logic

function clearLogs() {
    document.getElementById('log-container').innerHTML = '';
}

function appendLog(log) {
    const container = document.getElementById('log-container');
    if (!container) return;

    const div = document.createElement('div');
    const time = new Date(log.timestamp).toLocaleTimeString();

    let color = '#f8fafc';
    if (log.level === 'WRN') color = '#facc15';
    if (log.level === 'ERR') color = '#ef4444';
    if (log.message.includes('[AutoTune]')) color = '#10b981';

    div.style.color = color;
    div.innerHTML = `<span style="color: #94a3b8;">[${time}]</span> <span style="font-weight: 600;">${log.level}</span>: ${log.message}`;

    const isAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 50;
    container.appendChild(div);
    if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
    }

    if (container.children.length > 500) {
        container.removeChild(container.firstChild);
    }
}
