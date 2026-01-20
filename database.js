const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database_v5.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        db.serialize(() => {
            // Enable Foreign Keys - CRITICAL for cascade deletes to work
            db.run("PRAGMA foreign_keys = ON", (err) => {
                if (err) {
                    console.error('Error enabling foreign keys:', err.message);
                } else {
                    console.log('Foreign keys enabled for cascade deletes.');
                }
            });

            // Users Table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE,
                password TEXT,
                name TEXT,
                phone TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Customers Table
            db.run(`CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                unique_client_id TEXT UNIQUE,
                customer_name TEXT,
                short_name TEXT,
                msme_status TEXT, 
                address TEXT,
                gst_number TEXT,
                pan_number TEXT,
                org_type TEXT, 
                contact_person TEXT,
                contact_number TEXT,
                email_id TEXT,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // Contacts Table
            db.run(`CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                account_id INTEGER,
                name TEXT,
                email TEXT,
                phone TEXT,
                role TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(account_id) REFERENCES customers(id) ON DELETE CASCADE
            )`);

            // Leads Table
            db.run(`CREATE TABLE IF NOT EXISTS leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT,
                company_name TEXT,
                email TEXT,
                status TEXT,
                value REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // Tasks Table
            db.run(`CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                account_id INTEGER,
                title TEXT,
                type TEXT,
                description TEXT,
                due_date TEXT,
                status TEXT DEFAULT 'Pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(account_id) REFERENCES customers(id) ON DELETE CASCADE
            )`);

            // Products Table
            db.run(`CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT,
                sku TEXT,
                price REAL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);

            // Interactions Table
            db.run(`CREATE TABLE IF NOT EXISTS interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                account_id INTEGER,
                type TEXT, -- Note, Call, Meeting
                details TEXT,
                date DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(account_id) REFERENCES customers(id) ON DELETE CASCADE
            )`);

            // Purchase Orders Table - PO Number is now PRIMARY KEY
            db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
                po_number TEXT PRIMARY KEY,
                id INTEGER, -- Optional, can keep for compatibility but po_number is the unique key
                user_id INTEGER,
                account_id INTEGER,
                client_id TEXT, -- The unique_client_id from customers
                po_date TEXT,
                po_value REAL,
                bank_guarantee TEXT, -- 'Yes' or 'No'
                bill_to TEXT,
                ship_to TEXT,
                notes TEXT,
                bg_number TEXT,
                bg_expiry_date TEXT,
                bg_bank_name TEXT,
                bg_amount REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(account_id) REFERENCES customers(id) ON DELETE CASCADE
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS bg_fd_details (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                po_number TEXT NOT NULL,
                opening_balance_bg_limit REAL,
                bg_number TEXT,
                bg_start_date TEXT,
                bg_tenure_dd INTEGER,
                bg_tenure_mm INTEGER,
                bg_tenure_yy INTEGER,
                bg_end_date TEXT,
                bg_percentage REAL,
                bg_value REAL,
                bg_claim_period_required TEXT, -- 'Yes' or 'No'
                bg_status TEXT,
                bg_claim_period_dd INTEGER,
                bg_claim_period_mm INTEGER,
                bg_claim_period_yy INTEGER,
                bg_claim_date TEXT,
                bg_limit_remaining REAL,
                fd_percentage_on_bg REAL,
                fd_number TEXT,
                fd_start_date TEXT,
                fd_margin_actual REAL,
                fd_maturity_date TEXT,
                fd_maturity_amount REAL,
                rate_of_interest REAL,
                fd_status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(po_number) REFERENCES purchase_orders(po_number) ON DELETE CASCADE ON UPDATE CASCADE
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS po_line_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                po_number TEXT,
                line_item_no TEXT,
                line_item_type TEXT,
                description TEXT,
                quantity REAL,
                gst_rate REAL,
                hsn_sac_code TEXT,
                invoice_no TEXT,
                invoice_date TEXT,
                invoice_value REAL,
                payment_received REAL,
                pending_amount REAL,
                remarks TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(po_number) REFERENCES purchase_orders(po_number) ON DELETE CASCADE ON UPDATE CASCADE
            )`);

            // Migration: Add columns to po_line_items if they don't exist
            const liColumns = [
                'invoice_no TEXT',
                'invoice_date TEXT',
                'invoice_value REAL',
                'payment_received REAL',
                'pending_amount REAL',
                'remarks TEXT'
            ];
            liColumns.forEach(column => {
                db.run(`ALTER TABLE po_line_items ADD COLUMN ${column}`, (err) => { });
            });

            db.run(`CREATE TABLE IF NOT EXISTS po_milestones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                line_item_id INTEGER,
                milestone_name TEXT,
                quantity REAL,
                unit_price REAL,
                payment_cycle_pct REAL,
                cycle_value REAL,
                documents TEXT,
                payment_terms TEXT,
                delivery_date TEXT, -- Store as YYYY-MM-DD
                invoice_no TEXT,
                invoice_date TEXT,
                invoice_value REAL,
                payment_received REAL,
                pending_amount REAL,
                remarks TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(line_item_id) REFERENCES po_line_items(id) ON DELETE CASCADE
            )`);

            // Migration: Add columns to po_milestones if they don't exist
            const columnsToAdd = [
                'invoice_no TEXT',
                'invoice_date TEXT',
                'invoice_value REAL',
                'payment_received REAL',
                'pending_amount REAL',
                'remarks TEXT',
                'status TEXT',
                'credit_period INTEGER'
            ];

            columnsToAdd.forEach(column => {
                const [colName] = column.split(' ');
                db.run(`ALTER TABLE po_milestones ADD COLUMN ${column}`, (err) => {
                    if (err && !err.message.includes('duplicate column name')) {
                        // Ignore duplicate column errors, but log others if you want
                    }
                });
            });

            // Invoices Table
            db.run(`CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                po_number TEXT,
                line_item_id INTEGER,
                milestone_id INTEGER,
                invoice_no TEXT,
                invoice_date TEXT,
                taxable_value REAL,
                gst_value REAL,
                total_value REAL,
                credit_period INTEGER,
                due_date TEXT,
                payment_received REAL,
                pending_amount REAL,
                status TEXT,
                remarks TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(po_number) REFERENCES purchase_orders(po_number) ON DELETE CASCADE,
                FOREIGN KEY(line_item_id) REFERENCES po_line_items(id) ON DELETE CASCADE,
                FOREIGN KEY(milestone_id) REFERENCES po_milestones(id) ON DELETE CASCADE
            )`);

            // Payments Table - stores individual payment transactions
            db.run(`CREATE TABLE IF NOT EXISTS payments(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_no TEXT NOT NULL,
                po_number TEXT,
                invoice_date TEXT,
                taxable_value REAL,
                gst_value REAL,
                total_value REAL,
                tds_income_pct REAL DEFAULT 0,
                tds_gst_pct REAL DEFAULT 0,
                gst_hold_pct REAL DEFAULT 0,
                other_deduction REAL DEFAULT 0,
                tds_income_amt REAL DEFAULT 0,
                tds_gst_amt REAL DEFAULT 0,
                gst_hold_amt REAL DEFAULT 0,
                net_receivable REAL,
                actual_receivable REAL,
                amount_received REAL,
                payment_date TEXT,
                payment_mode TEXT,
                customer_remarks TEXT,
                internal_remarks TEXT,
                other_deduction_type TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(po_number) REFERENCES purchase_orders(po_number) ON DELETE CASCADE
            )`);

            // Migration: Add other_deduction_type to payments
            db.run(`ALTER TABLE payments ADD COLUMN other_deduction_type TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    // Ignore duplicate column errors
                }
            });

            console.log('Database tables initialized.');
        });
    }
});

module.exports = db;
