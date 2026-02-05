const ipBase = '192.168.1';

async function checkIp(i) {
    const ip = `${ipBase}.${i}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout

        const res = await fetch(`http://${ip}/api/system/info`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            console.log(`[FOUND] ${ip} - ${data.ASICModel || 'Unknown'} (${data.hostname})`);
        }
    } catch (e) {
        // console.log(`[FAILED] ${ip}: ${e.message}`);
    }
}

async function scan() {
    console.log('Scanning 192.168.1.1-254...');
    const promises = [];
    for (let i = 1; i < 255; i++) {
        promises.push(checkIp(i));
        // Batch to avoid too many open files/sockets? Node handles it ok usually for 254.
        // Let's do batches of 20
        if (i % 50 === 0) {
            await Promise.all(promises);
            promises.length = 0;
            console.log(`Scanned up to .${i}`);
        }
    }
    await Promise.all(promises);
    console.log('Scan complete.');
}

scan();
