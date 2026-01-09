const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database_v4.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) { console.error(err); return; }

    db.serialize(() => {
        db.all("SELECT * FROM interactions ORDER BY id DESC LIMIT 5", (err, rows) => {
            console.log('INTERACTIONS:', JSON.stringify(rows));
        });
        db.all("SELECT * FROM customers LIMIT 1", (err, rows) => {
            console.log('CUSTOMERS:', JSON.stringify(rows));
        });
        db.all("SELECT * FROM users LIMIT 1", (err, rows) => {
            console.log('USERS:', JSON.stringify(rows));
        });
    });
});
