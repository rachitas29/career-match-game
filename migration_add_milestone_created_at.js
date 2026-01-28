const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'crm.db'); // Assuming crm.db is in root
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("Checking schema for 'created_at' columns...");

    const checkAndAdd = (tableName) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
            if (err) {
                console.error(`Error checking ${tableName}:`, err);
                return;
            }
            const hasCreatedAt = rows.some(r => r.name === 'created_at');
            if (!hasCreatedAt) {
                console.log(`Adding created_at to ${tableName}...`);
                db.run(`ALTER TABLE ${tableName} ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
                    if (err) console.error(`Failed to alter ${tableName}:`, err);
                    else console.log(`Successfully added created_at to ${tableName}`);
                });
            } else {
                console.log(`${tableName} already has created_at.`);
            }
        });
    };

    checkAndAdd('po_milestones');
    checkAndAdd('po_line_items');
});

// Close DB after a short delay to allow async ops
setTimeout(() => {
    db.close((err) => {
        if (err) console.error(err);
        else console.log("Database connection closed.");
    });
}, 2000);
