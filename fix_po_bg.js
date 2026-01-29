const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

console.log('Updating PO/2026/90 to set bank_guarantee = Yes...\n');

db.run("UPDATE purchase_orders SET bank_guarantee = ? WHERE po_number = ?",
    ['Yes', 'PO/2026/90'],
    function (err) {
        if (err) {
            console.error('Error updating:', err);
        } else {
            console.log('✅ Successfully updated!');
            console.log('Rows affected:', this.changes);

            // Verify the update
            db.get("SELECT po_number, bank_guarantee FROM purchase_orders WHERE po_number = ?",
                ['PO/2026/90'],
                (err, row) => {
                    if (row) {
                        console.log('\nVerification:', JSON.stringify(row, null, 2));
                    }
                    db.close();
                }
            );
        }
    }
);
