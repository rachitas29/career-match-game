const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

console.log('Testing if delete is working...\n');

// First, check if there are any BG details for PO/2026/90
db.get("SELECT COUNT(*) as count FROM bg_fd_details WHERE po_number = ?", ['PO/2026/90'], (err, row) => {
    if (err) {
        console.error('Error:', err);
        db.close();
        return;
    }

    console.log('Current BG records for PO/2026/90:', row.count);

    if (row.count === 0) {
        console.log('\n✅ No BG details exist - delete is working OR there was nothing to delete');
    } else {
        console.log('\n⚠️ BG details still exist - delete might not be working');
        console.log('   OR you haven\'t clicked delete yet');
    }

    // Check PO record
    db.get("SELECT bank_guarantee FROM purchase_orders WHERE po_number = ?", ['PO/2026/90'], (err, po) => {
        if (po) {
            console.log('\nPO bank_guarantee field:', po.bank_guarantee);
            if (po.bank_guarantee === 'No') {
                console.log('✅ PO correctly shows No');
            } else {
                console.log('⚠️ PO still shows:', po.bank_guarantee);
            }
        }
        db.close();
    });
});
