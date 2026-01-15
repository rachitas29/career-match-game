const fetch = require('node-fetch');

async function check() {
    try {
        console.log('Fetching...');
        const res = await fetch('http://localhost:3000/api/purchase-orders/sdfsdf/line-items');
        console.log('Status:', res.status);
        const data = await res.json();
        console.log('Data:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

check();
