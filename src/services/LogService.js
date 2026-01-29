const util = require('util');

class LogService {
    constructor(io) {
        this.io = io;
        this.logs = [];
        this.maxLogs = 200;
        this.init();
    }

    init() {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;

        console.log = (...args) => {
            originalLog.apply(console, args);
            this.addLog('INF', args);
        };

        console.warn = (...args) => {
            originalWarn.apply(console, args);
            this.addLog('WRN', args);
        };

        console.error = (...args) => {
            originalError.apply(console, args);
            this.addLog('ERR', args);
        };
    }

    addLog(level, args) {
        const message = args.map(arg => {
            if (typeof arg === 'object') return util.inspect(arg, { depth: null, colors: false });
            return String(arg);
        }).join(' ');

        const entry = {
            timestamp: new Date().toISOString(),
            level: level,
            message: message
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        if (this.io) {
            this.io.emit('log_entry', entry);
        }
    }

    getLogs() {
        return this.logs;
    }
}

module.exports = LogService;
