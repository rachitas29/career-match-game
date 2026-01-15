const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database_v5.sqlite');
const db = new sqlite3.Database(dbPath);

db.get("SELECT po_number FROM purchase_orders WHERE po_number = 'sdfsdf'", (err, row) => {
    if (err) {
        console.error(err);
    } else {
        console.log(row ? "PO 'sdfsdf' exists" : "PO 'sdfsdf' NOT FOUND");
    }
    db.close();
});
