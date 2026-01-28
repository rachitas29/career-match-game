const db = require('./database');

db.serialize(() => {
    db.run("ALTER TABLE purchase_orders ADD COLUMN contact_id INTEGER", (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column contact_id already exists.');
            } else {
                console.error('Error adding contact_id:', err.message);
            }
        } else {
            console.log('Column contact_id added successfully.');
        }
    });

    db.run("ALTER TABLE purchase_orders ADD COLUMN project_name TEXT", (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column project_name already exists.');
            } else {
                console.error('Error adding project_name:', err.message);
            }
        } else {
            console.log('Column project_name added successfully.');
        }
    });
});
