const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database_v5.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, milestone_name, invoice_no, invoice_date, remarks FROM po_milestones WHERE invoice_no IS NOT NULL ORDER BY id DESC LIMIT 5", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});
