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
        // Add date column if it doesn't exist
        // Note: SQLite doesn't support IF NOT EXISTS for ADD COLUMN directly in standard SQL, 
        // but it will error if it exists, which we can catch or ignore, 
        // OR we can check schema first. Since we know it's missing, we'll try to add it.

        console.log('Attempting to add date column to interactions table...');

        db.run("ALTER TABLE interactions ADD COLUMN date DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('Column "date" already exists.');
                } else {
                    console.error('Error adding column:', err.message);
                }
            } else {
                console.log('Successfully added "date" column.');
            }
        });
    });

    db.close((err) => {
        if (err) {
            console.error('Error closing database', err.message);
        } else {
            console.log('Database connection closed.');
        }
    });
});
