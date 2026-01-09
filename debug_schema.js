const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database_v4.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        fs.writeFileSync('users_dump.txt', 'Error opening database: ' + err.message);
        return;
    }

    db.all("SELECT id, email, name FROM users", (err, rows) => {
        if (err) {
            console.error('Error selecting users:', err.message);
            fs.writeFileSync('users_dump.txt', 'Error: ' + err.message);
            return;
        }
        console.log('Users found:', rows.length);
        let content = 'User Count: ' + rows.length + '\n';
        rows.forEach(r => content += JSON.stringify(r) + '\n');
        fs.writeFileSync('users_dump.txt', content);
    });
});
