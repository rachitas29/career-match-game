const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

console.log('Manually updating PO/2026/90 to bank_guarantee = No...\n');

db.run("UPDATE purchase_orders SET bank_guarantee = ? WHERE po_number = ?",
    ['No', 'PO/2026/90'],
    function (err) {
        if (err) {
            console.error('Error:', err);
        } else {
            console.log('✅ Updated successfully!');
            console.log('Rows affected:', this.changes);
        }
        db.close();
    }
);
