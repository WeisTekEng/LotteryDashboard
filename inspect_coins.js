const miners = [
    '192.168.1.156',
    '192.168.1.197',
    '192.168.1.200',
    '192.168.1.204'
];

async function inspect(ip) {
    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 2000);

        const res = await fetch(`http://${ip}/api/system/info`, { signal: controller.signal });
        if (res.ok) {
            const data = await res.json();
            const pool = data.isUsingFallbackStratum ? data.fallbackStratumURL : data.stratumURL;
            const user = data.isUsingFallbackStratum ? data.fallbackStratumUser : data.stratumUser;

            console.log(`IP: ${ip}`);
            console.log(`  Hostname: ${data.hostname}`);
            console.log(`  Pool: ${pool}`);
            console.log(`  User: ${user}`);
            console.log('-----------------------------------');
        }
    } catch (e) {
        console.log(`Failed to fetch ${ip}: ${e.message}`);
    }
}

async function run() {
    console.log('Inspecting miners...');
    for (const ip of miners) {
        await inspect(ip);
    }
}

run();
