const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database_v5.sqlite');
db.all("SELECT * FROM po_milestones LIMIT 5", (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows, null, 2));
    db.close();
});
