const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

console.log('Checking latest BG details for PO/2026/90...\n');

db.get("SELECT * FROM bg_fd_details WHERE po_number = ? ORDER BY id DESC LIMIT 1",
    ['PO/2026/90'],
    (err, row) => {
        if (err) {
            console.error('Error:', err);
        } else if (row) {
            console.log('✅ BG Details FOUND in database!');
            console.log('\nRecord ID:', row.id);
            console.log('BG Number:', row.bg_number);
            console.log('BG Value:', row.bg_value);
            console.log('Opening Balance:', row.opening_balance_bg_limit);
            console.log('\nFull record:', JSON.stringify(row, null, 2));
        } else {
            console.log('❌ BG Details NOT FOUND');
        }

        // Check PO record
        db.get("SELECT po_number, bank_guarantee FROM purchase_orders WHERE po_number = ?",
            ['PO/2026/90'],
            (err, poRow) => {
                if (poRow) {
                    console.log('\n--- PO Record ---');
                    console.log('bank_guarantee:', poRow.bank_guarantee);
                    if (poRow.bank_guarantee === 'Yes') {
                        console.log('✅ PO correctly shows BG = Yes');
                    } else {
                        console.log('❌ PO shows:', poRow.bank_guarantee);
                    }
                }
                db.close();
            }
        );
    }
);
