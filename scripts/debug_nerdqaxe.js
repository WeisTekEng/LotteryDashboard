const fs = require('fs');

const ip = process.argv[2];

if (!ip) {
    console.log("Usage: node debug_nerdqaxe.js <IP_ADDRESS>");
    process.exit(1);
}

const outputFile = `debug_nerdqaxe_${ip.replace(/\./g, '_')}_${Date.now()}.json`;

console.log(`[Debug] Connecting to NerdQAxe at ${ip}...`);
console.log(`[Debug] Saving raw data to ${outputFile}`);

async function runDebug() {
    try {
        const resp = await fetch(`http://${ip}/api/system/info`);
        if (!resp.ok) {
            console.error(`[Error] HTTP ${resp.status} ${resp.statusText}`);
            return;
        }

        const data = await resp.json();

        // Write raw data to file
        fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
        console.log(`[Success] Data saved.`);

        // --- Analysis ---
        console.log("\n--- NerdQAxe Diagnostic Report ---");
        console.log(`Device Model: ${data.deviceModel}`);
        console.log(`Board Version: ${data.boardVersion}`);
        console.log(`Firmware Version: ${data.version}`);

        console.log("\n--- Performance ---");
        console.log(`Hashrate: ${data.hashRate} GH/s (1m: ${data.hashRate_1m}, 1h: ${data.hashRate_1h})`);
        console.log(`Power: ${data.power} W`);
        console.log(`Voltage: ${data.voltage} mV (Input)`);
        console.log(`Core Voltage: ${data.coreVoltage} mV (Set), ${data.coreVoltageActual || 'N/A'} mV (Actual)`);
        console.log(`Frequency: ${data.frequency} MHz`);
        console.log(`Temp: ${data.temp}°C (VR: ${data.vrTemp}°C)`);

        console.log("\n--- Error Analysis ---");
        const sharesAccepted = data.sharesAccepted || 0;
        const sharesRejected = data.sharesRejected || 0;
        const totalShares = sharesAccepted + sharesRejected;
        const calcErrorRate = totalShares > 0 ? (sharesRejected / totalShares) * 100 : 0;

        console.log(`Shares: ${sharesAccepted} A / ${sharesRejected} R`);
        console.log(`Calculated Error Rate: ${calcErrorRate.toFixed(2)}%`);
        console.log(`Explicit Error %: ${data.errorPercentage !== undefined ? data.errorPercentage + '%' : 'Not Reported'}`);

        const hwErrors = data.hashrateMonitor?.asics?.[0]?.errorCount || 0;
        console.log(`Hardware Errors (Register): ${hwErrors}`);

        console.log("\n--- Fault Flags ---");
        console.log(`Last Reset Reason: "${data.lastResetReason}"`);
        console.log(`Uptime: ${data.uptimeSeconds}s (${(data.uptimeSeconds / 60).toFixed(1)} min)`);

        const isPanic = (data.lastResetReason || '').toLowerCase().includes('panic');
        const isWDT = (data.lastResetReason || '').toLowerCase().includes('wdt');
        const isBrownout = (data.lastResetReason || '').toLowerCase().includes('brownout');
        const isDeadlock = data.uptimeSeconds > 60 && data.hashRate === 0 && hwErrors > 100;

        if (isPanic) console.log("!! FLAG: Panic Reset Detected");
        if (isWDT) console.log("!! FLAG: Watchdog Timer Reset Detected");
        if (isBrownout) console.log("!! FLAG: Brownout Detected (Check Power Supply)");
        if (isDeadlock) console.log("!! FLAG: Deadlock Inferred (Uptime > 60s, 0 Hashrate, High HW Errors)");

        if (!isPanic && !isWDT && !isBrownout && !isDeadlock) {
            console.log("No obvious fault flags inferred from reset reason or hashrate/error patterns.");
        }

    } catch (e) {
        console.error(`[Fatal] Connection failed: ${e.message}`);
    }
}

runDebug();
