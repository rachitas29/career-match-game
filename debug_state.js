const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database_v4.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        return;
    }
    console.log('Connected to database.');

    db.serialize(() => {
        console.log('\n--- Recent Interactions (Last 5) ---');
        db.all("SELECT id, date, details, type, account_id FROM interactions ORDER BY id DESC LIMIT 5", (err, rows) => {
            if (err) console.error(err);
            else console.table(rows);
        });

        console.log('\n--- Customers (limit 3) ---');
        db.all("SELECT id, customer_name FROM customers LIMIT 3", (err, rows) => {
            if (err) console.error(err);
            else console.table(rows);
        });

        console.log('\n--- Users (limit 1) ---');
        db.all("SELECT id, email, password FROM users LIMIT 1", (err, rows) => {
            if (err) console.error(err);
            else console.table(rows);
        });
    });
});
