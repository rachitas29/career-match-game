const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');

db.serialize(() => {
    console.log('--- Total Counts ---');
    db.get('SELECT COUNT(*) as count FROM po_line_items', (err, row) => {
        console.log('Total Line Items:', row ? row.count : 'Error');
    });
    db.get('SELECT COUNT(*) as count FROM po_milestones', (err, row) => {
        console.log('Total Milestones:', row ? row.count : 'Error');
    });

    console.log('\n--- Recent Line Items (Last 10) ---');
    db.all('SELECT * FROM po_line_items ORDER BY id DESC LIMIT 10', (err, rows) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(rows, null, 2));
    });

    console.log('\n--- Check for PO/2026/200 ---');
    db.all('SELECT * FROM po_line_items WHERE po_number = "PO/2026/200"', (err, rows) => {
        if (err) console.error(err);
        else console.log('Line Items for PO/2026/200:', JSON.stringify(rows, null, 2));
    });
});
db.close();
