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
                if (!pgSql.toUpperCase().includes('RETURNING')) {
                    finalSql += ' RETURNING id';
                }
            }

            pool.query(finalSql, params, (err, res) => {
                if (err) {
                    console.error('DATABASE RUN ERROR:', err.message, 'SQL:', finalSql, 'Params:', params);
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
                    console.error('DATABASE GET ERROR:', err.message, 'SQL:', pgSql);
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
                    console.error('DATABASE ALL ERROR:', err.message, 'SQL:', pgSql);
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
        close: (callback) => pool.end(callback),
        transaction: function (callback) {
            pool.connect((err, client, release) => {
                if (err) return callback(err);
                const txDb = {
                    isPostgres: true,
                    run: function (sql) {
                        const { params: p, callback: c } = processArgs(Array.prototype.slice.call(arguments, 1));
                        let counter = 1;
                        let pgSql = sql.replace(/\?/g, () => `$${counter++}`);
                        if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
                            pgSql += ' RETURNING id';
                        }
                        client.query(pgSql, p, (err, res) => {
                            if (err) {
                                console.error('TX RUN ERROR:', err.message, 'SQL:', pgSql, 'Params:', p);
                                if (c) c(err);
                            } else {
                                const result = {
                                    lastID: res.rows && res.rows[0] ? (res.rows[0].id || res.rows[0].id_user || null) : null,
                                    changes: res.rowCount
                                };
                                if (c) c.call(result, null);
                            }
                        });
                    },
                    get: function (sql) {
                        const { params: p, callback: c } = processArgs(Array.prototype.slice.call(arguments, 1));
                        let counter = 1;
                        let pgSql = sql.replace(/\?/g, () => `$${counter++}`);
                        client.query(pgSql, p, (err, res) => {
                            if (err) { if (c) c(err); }
                            else if (c) c(null, res.rows[0]);
                        });
                    },
                    all: function (sql) {
                        const { params: p, callback: c } = processArgs(Array.prototype.slice.call(arguments, 1));
                        let counter = 1;
                        let pgSql = sql.replace(/\?/g, () => `$${counter++}`);
                        client.query(pgSql, p, (err, res) => {
                            if (err) { if (c) c(err); }
                            else if (c) c(null, res.rows);
                        });
                    }
                };
                client.query('BEGIN', (err) => {
                    if (err) { release(); return callback(err); }
                    callback(null, txDb, (done) => {
                        client.query('COMMIT', (err) => {
                            release();
                            if (done) done(err);
                        });
                    }, (err, done) => {
                        client.query('ROLLBACK', () => {
                            release();
                            if (done) done(err);
                        });
                    });
                });
            });
        }
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
    db.transaction = function (callback) {
        db.serialize(() => {
            callback(null, db, (done) => {
                db.run('COMMIT', (err) => { if (done) done(err); });
            }, (err, done) => {
                db.run('ROLLBACK', () => { if (done) done(err); });
            });
        });
    };
}

async function initializeTables() {
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
        `CREATE TABLE IF NOT EXISTS contacts (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            account_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
            name TEXT,
            email TEXT,
            phone TEXT,
            role TEXT,
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
        )`,
        `CREATE TABLE IF NOT EXISTS leads (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name TEXT,
            company_name TEXT,
            email TEXT,
            status TEXT,
            value NUMERIC,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS tasks (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            account_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
            title TEXT,
            type TEXT,
            description TEXT,
            due_date TEXT,
            status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS products (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name TEXT,
            sku TEXT,
            price NUMERIC,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS interactions (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            account_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
            type TEXT,
            details TEXT,
            date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS bg_fd_details (
            id ${isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${isPostgres ? '' : 'AUTOINCREMENT'},
            po_number TEXT REFERENCES purchase_orders(po_number) ON DELETE CASCADE ON UPDATE CASCADE,
            opening_balance_bg_limit NUMERIC,
            bg_number TEXT,
            bg_start_date TEXT,
            bg_tenure_dd INTEGER,
            bg_tenure_mm INTEGER,
            bg_tenure_yy INTEGER,
            bg_end_date TEXT,
            bg_percentage NUMERIC,
            bg_value NUMERIC,
            bg_claim_period_required TEXT,
            bg_status TEXT,
            bg_claim_period_dd INTEGER,
            bg_claim_period_mm INTEGER,
            bg_claim_period_yy INTEGER,
            bg_claim_date TEXT,
            bg_limit_remaining NUMERIC,
            fd_percentage_on_bg NUMERIC,
            fd_number TEXT,
            fd_start_date TEXT,
            fd_margin_actual NUMERIC,
            fd_maturity_date TEXT,
            fd_maturity_amount NUMERIC,
            rate_of_interest NUMERIC,
            fd_status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    for (const sql of schemas) {
        try {
            await new Promise((resolve) => {
                db.run(sql, (err) => {
                    if (err && !err.message.includes('already exists') && !err.message.toLowerCase().includes('duplicate')) {
                        console.error('Error initializing table:', err.message);
                    }
                    resolve();
                });
            });
        } catch (e) {
            console.error('Table initialization error:', e);
        }
    }
    console.log('Database initialization complete.');
}

initializeTables().catch(err => console.error('Bootstrap failed:', err));

module.exports = db;
