const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

// First check if table exists
db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%bg%'", (err, tables) => {
    if (err) {
        console.error('Error checking tables:', err);
        db.close();
        return;
    }

    console.log('BG-related tables:', JSON.stringify(tables, null, 2));

    // Check for BG details for specific PO
    db.get("SELECT * FROM bg_fd_details WHERE po_number = ?", ['PO/2026/90'], (err, row) => {
        if (err) {
            console.error('Error querying BG details:', err);
        } else if (row) {
            console.log('\n✅ BG Details EXIST for PO/2026/90:');
            console.log(JSON.stringify(row, null, 2));
        } else {
            console.log('\n❌ BG Details NOT FOUND for PO/2026/90');
        }

        db.close();
    });
});
