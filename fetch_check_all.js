const fetch = require('node-fetch');

async function check() {
    try {
        const po = 'sdfsdf';
        console.log('Fetching PO...');
        const res1 = await fetch(`http://localhost:3000/api/purchase-orders/${po}`);
        console.log('PO Status:', res1.status);

        console.log('Fetching Invoices...');
        const res3 = await fetch(`http://localhost:3000/api/purchase-orders/${po}/invoices`);
        console.log('Invoices Status:', res3.status);
        const data3 = await res3.json();
        console.log('Invoices Count:', data3.invoices ? data3.invoices.length : 'none');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

check();
