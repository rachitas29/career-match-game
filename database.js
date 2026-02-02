const { Pool } = require('pg');
const path = require('path');

const isPostgres = !!process.env.DATABASE_URL;

let db;

function processArgs(args) {
    let sqlParams = [];
    let callback = null;

    if (args.length > 0) {
        const lastArg = args[args.length - 1];
        if (typeof lastArg === 'function') {
            callback = lastArg;
            sqlParams = Array.prototype.slice.call(args, 0, args.length - 1);
        } else {
            sqlParams = Array.prototype.slice.call(args);
        }
    }

    // Handle case where params are passed as a single array as the first non-sql arg
    if (sqlParams.length === 1 && Array.isArray(sqlParams[0])) {
        sqlParams = sqlParams[0];
    }

    return { params: sqlParams, callback };
}

if (isPostgres) {
    console.log('Connecting to PostgreSQL database...');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    db = {
        pool: pool,
        isPostgres: true,
        run: function (sql) {
            const { params, callback } = processArgs(Array.prototype.slice.call(arguments, 1));
            let counter = 1;
            const pgSql = sql.replace(/\?/g, () => `$${counter++}`);

            let finalSql = pgSql;
            if (pgSql.trim().toUpperCase().startsWith('INSERT')) {
                // Only add RETURNING id if it doesn't already have a RETURNING clause
                if (!pgSql.toUpperCase().includes('RETURNING')) {
                    finalSql += ' RETURNING id';
                }
            }

            pool.query(finalSql, params, (err, res) => {
                if (err) {
                    if (callback) callback(err);
                } else {
                    const result = {
                        lastID: res.rows && res.rows[0] ? (res.rows[0].id || res.rows[0].id_user || null) : null,
                        changes: res.rowCount
                    };
                    if (callback) callback.call(result, null);
                }
            });
        },
        get: function (sql) {
            const { params, callback } = processArgs(Array.prototype.slice.call(arguments, 1));
            let counter = 1;
            const pgSql = sql.replace(/\?/g, () => `$${counter++}`);
            pool.query(pgSql, params, (err, res) => {
                if (err) {
                    if (callback) callback(err);
                } else {
                    if (callback) callback(null, res.rows[0]);
                }
            });
        },
        all: function (sql) {
            const { params, callback } = processArgs(Array.prototype.slice.call(arguments, 1));
            let counter = 1;
            const pgSql = sql.replace(/\?/g, () => `$${counter++}`);
            pool.query(pgSql, params, (err, res) => {
                if (err) {
                    if (callback) callback(err);
                } else {
                    if (callback) callback(null, res.rows);
                }
            });
        },
        prepare: function (sql) {
            return {
                run: function () {
                    const args = Array.prototype.slice.call(arguments);
                    db.run(sql, ...args);
                },
                get: function () {
                    const args = Array.prototype.slice.call(arguments);
                    db.get(sql, ...args);
                },
                all: function () {
                    const args = Array.prototype.slice.call(arguments);
                    db.all(sql, ...args);
                },
                finalize: () => { }
            };
        },
        serialize: (cb) => cb(),
        close: (callback) => pool.end(callback)
    };
} else {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.resolve(__dirname, 'database_v5.sqlite');
    console.log('Connecting to SQLite database at:', dbPath);
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error('Error opening SQLite database', err.message);
        else {
            db.run("PRAGMA foreign_keys = ON");
        }
    });
    db.isPostgres = false;
}

function initializeTables() {
    // ... (rest of the schema logic remains the same)
    const schemas = [
        `CREATE TABLE IF NOT EXISTS users (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            phone TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS customers (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS purchase_orders (
            po_number TEXT PRIMARY KEY,
            id INTEGER,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            account_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
            client_id TEXT,
            po_date TEXT,
            po_value NUMERIC,
            bank_guarantee TEXT,
            bill_to TEXT,
            ship_to TEXT,
            notes TEXT,
            bg_number TEXT,
            bg_expiry_date TEXT,
            bg_bank_name TEXT,
            bg_amount NUMERIC,
            contact_id INTEGER,
            project_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS po_line_items (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            po_number TEXT REFERENCES purchase_orders(po_number) ON DELETE CASCADE ON UPDATE CASCADE,
            line_item_no TEXT,
            line_item_type TEXT,
            description TEXT,
            quantity NUMERIC,
            gst_rate NUMERIC,
            hsn_sac_code TEXT,
            invoice_no TEXT,
            invoice_date TEXT,
            invoice_value NUMERIC,
            payment_received NUMERIC,
            pending_amount NUMERIC,
            remarks TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS po_milestones (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            line_item_id INTEGER REFERENCES po_line_items(id) ON DELETE CASCADE,
            milestone_name TEXT,
            quantity NUMERIC,
            unit_price NUMERIC,
            payment_cycle_pct NUMERIC,
            cycle_value NUMERIC,
            documents TEXT,
            payment_terms TEXT,
            delivery_date TEXT,
            invoice_no TEXT,
            invoice_date TEXT,
            invoice_value NUMERIC,
            payment_received NUMERIC,
            pending_amount NUMERIC,
            remarks TEXT,
            status TEXT,
            credit_period INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS invoices (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            po_number TEXT REFERENCES purchase_orders(po_number) ON DELETE CASCADE,
            line_item_id INTEGER REFERENCES po_line_items(id) ON DELETE CASCADE,
            milestone_id INTEGER REFERENCES po_milestones(id) ON DELETE CASCADE,
            invoice_no TEXT,
            invoice_date TEXT,
            taxable_value NUMERIC,
            gst_value NUMERIC,
            total_value NUMERIC,
            credit_period INTEGER,
            due_date TEXT,
            payment_received NUMERIC,
            pending_amount NUMERIC,
            status TEXT,
            remarks TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS payments(
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            invoice_no TEXT NOT NULL,
            po_number TEXT REFERENCES purchase_orders(po_number) ON DELETE CASCADE,
            invoice_date TEXT,
            taxable_value NUMERIC,
            gst_value NUMERIC,
            total_value NUMERIC,
            tds_income_pct NUMERIC DEFAULT 0,
            tds_gst_pct NUMERIC DEFAULT 0,
            gst_hold_pct NUMERIC DEFAULT 0,
            other_deduction NUMERIC DEFAULT 0,
            tds_income_amt NUMERIC DEFAULT 0,
            tds_gst_amt NUMERIC DEFAULT 0,
            gst_hold_amt NUMERIC DEFAULT 0,
            net_receivable NUMERIC,
            actual_receivable NUMERIC,
            amount_received NUMERIC,
            payment_date TEXT,
            payment_mode TEXT,
            customer_remarks TEXT,
            internal_remarks TEXT,
            other_deduction_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    db.serialize(() => {
        for (const sql of schemas) {
            db.run(sql, (err) => {
                if (err && !err.message.includes('already exists')) {
                    // Postgres might throw "relation already exists"
                }
            });
        }
    });
}

initializeTables();

module.exports = db;
