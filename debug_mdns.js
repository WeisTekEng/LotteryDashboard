const mdns = require('multicast-dns')();

console.log('Listening for mDNS packets...');

mdns.on('response', (response) => {
    console.log('--- Response Received ---');
    response.answers.forEach(a => {
        console.log(`Answer: ${a.name} (${a.type}) -> ${a.data}`);
    });
    response.additionals.forEach(a => {
        console.log(`Additional: ${a.name} (${a.type}) -> ${a.data}`);
    });
});

mdns.query({
    questions: [{
        name: '_http._tcp.local',
        type: 'PTR'
    }]
});

// Also just query for * (wildcard? no, standard implies querying specific services)
// But let's try querying for just standard services
setTimeout(() => {
    console.log('Querying for _services._dns-sd._udp.local...');
    mdns.query({
        questions: [{
            name: '_services._dns-sd._udp.local',
            type: 'PTR'
        }]
    });
}, 5000);
