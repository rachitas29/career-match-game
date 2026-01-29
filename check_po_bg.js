const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

db.get("SELECT po_number, bank_guarantee FROM purchase_orders WHERE po_number = ?", ['PO/2026/90'], (err, row) => {
    if (err) {
        console.error('Error:', err);
    } else if (row) {
        console.log('PO Record:', JSON.stringify(row, null, 2));
        console.log('\nbank_guarantee value:', row.bank_guarantee);

        if (row.bank_guarantee === 'Yes') {
            console.log('✅ Status: Correctly set to Yes');
        } else {
            console.log('❌ Problem: bank_guarantee is NOT set to Yes!');
            console.log('   This is why BG details are not loading in the form.');
        }
    } else {
        console.log('PO not found');
    }

    db.close();
});
