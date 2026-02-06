const os = require('os');
const CONFIG = require('../config');

class ScannerService {
    constructor(minerService) {
        this.minerService = minerService;
    }

    getLocalSubnets() {
        const interfaces = os.networkInterfaces();
        const subnets = [];
        for (const name in interfaces) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    const parts = iface.address.split('.');
                    parts.pop();
                    subnets.push(parts.join('.'));
                }
            }
        }
        return [...new Set(subnets)];
    }

    async checkMinerIp(ip) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);

            const res = await fetch(`http://${ip}/api/system/info`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                // Notify miner service to add this miner if new
                await this.minerService.addDiscoveredMiner(ip, data);
            }
        } catch (e) {
            // Ignore errors
        }
    }

    async runNetworkScan() {
        // Use manually configured subnet if available (supports Docker bridge mode)
        const manualSubnet = CONFIG.PORTS.SCAN_SUBNET;
        let subnets = [];

        if (manualSubnet) {
            // Handle "192.168.1.0/24" or just "192.168.1"
            let base = manualSubnet.split('/')[0];
            const parts = base.split('.');
            if (parts.length === 4) parts.pop(); // Remove last octet if full IP provided
            if (parts.length === 3) subnets = [parts.join('.')];
        } else {
            subnets = this.getLocalSubnets();
        }

        console.log(`[Scanner] Starting scan on subnets: ${subnets.join(', ')}`);
        for (const subnet of subnets) {
            const promises = [];
            for (let i = 1; i < 255; i++) {
                const ip = `${subnet}.${i}`;
                promises.push(this.checkMinerIp(ip));
                if (promises.length >= 50) {
                    await Promise.all(promises);
                    promises.length = 0;
                }
            }
            await Promise.all(promises);
        }
        console.log('[Scanner] Scan complete.');
    }

    start(interval = 120000) {
        setInterval(() => this.runNetworkScan(), interval);
        setTimeout(() => this.runNetworkScan(), 2000);
    }
}

module.exports = ScannerService;
