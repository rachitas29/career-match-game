const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

db.serialize(() => {
    console.log('--- Table Info: po_line_items ---');
    db.all('PRAGMA table_info(po_line_items)', (err, rows) => {
        if (err) console.error(err);
        else console.log(rows);
    });

    console.log('\n--- Rows for PO/2026/200 in po_line_items ---');
    db.all('SELECT * FROM po_line_items WHERE po_number = "PO/2026/200"', (err, rows) => {
        if (err) console.error(err);
        else console.log(rows);
    });

    console.log('\n--- Rows for PO/2026/200 in po_milestones ---');
    db.all('SELECT pm.* FROM po_milestones pm JOIN po_line_items pli ON pm.line_item_id = pli.id WHERE pli.po_number = "PO/2026/200"', (err, rows) => {
        if (err) console.error(err);
        else console.log(rows);
    });

    console.log('\n--- Recent 5 line items ---');
    db.all('SELECT * FROM po_line_items ORDER BY created_at DESC LIMIT 5', (err, rows) => {
        if (err) console.error(err);
        else console.log(rows);
    });
});
db.close();
