const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database_v5.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Checking payments table...');

db.all('SELECT * FROM payments ORDER BY created_at DESC LIMIT 5', [], (err, rows) => {
    if (err) {
        console.error('Error querying payments table:', err.message);
    } else {
        console.log(`Found ${rows.length} recent payment records.`);
        if (rows.length > 0) {
            console.log('Latest Record:', JSON.stringify(rows[0], null, 2));
        }
    }
    db.close();
});
