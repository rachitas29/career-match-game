const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

db.all('SELECT pm.* FROM po_milestones pm JOIN po_line_items pli ON pm.line_item_id = pli.id WHERE pli.po_number = "PO/2026/201"', (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(`Found ${rows.length} milestones for PO/2026/201`);
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});
