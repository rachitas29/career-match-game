const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database_v5.sqlite');
const db = new sqlite3.Database(dbPath);

const poNumber = 'PO/2026/1001';

let output = '';
output += `Checking for PO: ${poNumber}\n`;
output += `Database: ${dbPath}\n`;

db.serialize(() => {
    // Check purchase_orders table
    db.all(`SELECT * FROM purchase_orders WHERE po_number = ?`, [poNumber], (err, rows) => {
        output += '\n=== purchase_orders Table ===\n';
        if (err) {
            output += 'Error: ' + err.message + '\n';
        } else {
            output += 'Found: ' + rows.length + ' record(s)\n';
            if (rows.length > 0) {
                output += JSON.stringify(rows, null, 2) + '\n';
            }
        }
    });

    // Check po_line_items table
    db.all(`SELECT * FROM po_line_items WHERE po_number = ?`, [poNumber], (err, rows) => {
        output += '\n=== po_line_items Table ===\n';
        if (err) {
            output += 'Error: ' + err.message + '\n';
        } else {
            output += 'Found: ' + rows.length + ' record(s)\n';
            if (rows.length > 0) {
                output += JSON.stringify(rows, null, 2) + '\n';
            }
        }

        // Write output to file
        fs.writeFileSync('check_result_utf8.txt', output, 'utf8');
        console.log('Results written to check_result_utf8.txt');
        db.close();
    });
});
