const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

db.all('SELECT * FROM po_line_items WHERE po_number = "PO/2026/201"', (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(`Found ${rows.length} line items for PO/2026/201`);
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});
