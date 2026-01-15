const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database_v5.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM invoices ORDER BY id DESC LIMIT 5", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});
