const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

console.log('Fixing all PO records to match BG data...\n');

// Step 1: Get all POs with BG details
db.all("SELECT DISTINCT po_number FROM bg_fd_details", (err, bgPos) => {
    if (err) {
        console.error('Error:', err);
        db.close();
        return;
    }

    const poNumbersWithBg = bgPos.map(row => row.po_number);
    console.log('Found', poNumbersWithBg.length, 'POs with BG details');

    // Step 2: Update ALL POs - set to 'Yes' if they have BG, 'No' if they don't
    db.run("UPDATE purchase_orders SET bank_guarantee = 'No'", (err) => {
        if (err) {
            console.error('Error resetting:', err);
            db.close();
            return;
        }

        console.log('Reset all POs to No BG');

        if (poNumbersWithBg.length === 0) {
            console.log('No POs with BG details found. All done!');
            db.close();
            return;
        }

        // Now set Yes for POs that have BG
        const placeholders = poNumbersWithBg.map(() => '?').join(',');
        db.run(`UPDATE purchase_orders SET bank_guarantee = 'Yes' WHERE po_number IN (${placeholders})`,
            poNumbersWithBg,
            function (err) {
                if (err) {
                    console.error('Error updating:', err);
                } else {
                    console.log('✅ Set bank_guarantee=Yes for', this.changes, 'POs');
                    console.log('\nPOs with BG:', poNumbersWithBg.join(', '));
                }
                db.close();
            }
        );
    });
});
