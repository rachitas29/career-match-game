const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

console.log('Checking if BG details still exist for PO/2026/90...\n');

db.get("SELECT * FROM bg_fd_details WHERE po_number = ?", ['PO/2026/90'], (err, row) => {
    if (err) {
        console.error('Error:', err);
    } else if (row) {
        console.log('❌ PROBLEM: BG details STILL EXIST in database!');
        console.log('The delete did NOT work.');
        console.log('\nRecord:', JSON.stringify(row, null, 2));
    } else {
        console.log('✅ BG details successfully deleted from database');
    }

    // Also check the purchase_orders table
    db.get("SELECT po_number, bank_guarantee FROM purchase_orders WHERE po_number = ?",
        ['PO/2026/90'],
        (err, poRow) => {
            if (poRow) {
                console.log('\nPO record bank_guarantee field:', poRow.bank_guarantee);
                if (poRow.bank_guarantee === 'No') {
                    console.log('✅ PO correctly updated to No');
                } else {
                    console.log('❌ PO still shows:', poRow.bank_guarantee);
                }
            }
            db.close();
        }
    );
});
