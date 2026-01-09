const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database_v4.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        return;
    }
    console.log('Connected to database at ' + dbPath);

    db.serialize(() => {
        // Check schema
        console.log('\n--- Schema for interactions ---');
        db.all("PRAGMA table_info(interactions)", (err, rows) => {
            if (err) {
                console.error('Error getting schema:', err.message);
            } else {
                console.table(rows);
            }
        });

        // Check content
        console.log('\n--- Recent Interactions ---');
        db.all("SELECT * FROM interactions ORDER BY id DESC LIMIT 5", (err, rows) => {
            if (err) {
                console.error('Error getting interactions:', err.message);
            } else {
                console.table(rows);
            }
        });
    });
});
