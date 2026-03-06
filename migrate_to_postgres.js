/**
 * migrate_to_postgres.js
 * Copies all data from local SQLite (database_v5.sqlite) to a target PostgreSQL database.
 *
 * Usage:
 *   $env:TARGET_DATABASE_URL="postgres://user:pass@host/dbname?sslmode=require"
 *   node migrate_to_postgres.js
 */

require('dotenv').config();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const TARGET_URL = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

if (!TARGET_URL || TARGET_URL.includes('your_connection')) {
    console.error('\n❌  Set TARGET_DATABASE_URL to your new PostgreSQL connection string.');
    console.error('    Example (PowerShell):');
    console.error('    $env:TARGET_DATABASE_URL="postgres://user:pass@host/db?sslmode=require"');
    console.error('    node migrate_to_postgres.js\n');
    process.exit(1);
}

const sqliteDb = new sqlite3.Database(
    path.resolve(__dirname, 'database_v5.sqlite'),
    sqlite3.OPEN_READONLY,
    err => { if (err) { console.error('Cannot open SQLite:', err.message); process.exit(1); } }
);

const pool = new Pool({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } });

function sqliteAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDb.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
    });
}

async function pgRun(sql, params = []) {
    return pool.query(sql, params);
}

// ── Schema ──────────────────────────────────────────────────────────────────
async function createTables(client) {
    const tables = [
        `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            phone TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            unique_client_id TEXT UNIQUE,
            customer_name TEXT, short_name TEXT, msme_status TEXT,
            address TEXT, gst_number TEXT, pan_number TEXT, org_type TEXT,
            contact_person TEXT, contact_number TEXT, email_id TEXT, notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS contacts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            account_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
            name TEXT, email TEXT, phone TEXT, role TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS purchase_orders (
            po_number TEXT PRIMARY KEY,
            id INTEGER,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            account_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
            client_id TEXT, po_date TEXT, po_value NUMERIC,
            bank_guarantee TEXT, bill_to TEXT, ship_to TEXT, notes TEXT,
            bg_number TEXT, bg_expiry_date TEXT, bg_bank_name TEXT, bg_amount NUMERIC,
            contact_id INTEGER, project_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS po_line_items (
            id SERIAL PRIMARY KEY,
            po_number TEXT REFERENCES purchase_orders(po_number) ON DELETE CASCADE ON UPDATE CASCADE,
            line_item_no TEXT, line_item_type TEXT, description TEXT,
            quantity NUMERIC, gst_rate NUMERIC, hsn_sac_code TEXT,
            invoice_no TEXT, invoice_date TEXT, invoice_value NUMERIC,
            payment_received NUMERIC, pending_amount NUMERIC, remarks TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS po_milestones (
            id SERIAL PRIMARY KEY,
            line_item_id INTEGER REFERENCES po_line_items(id) ON DELETE CASCADE,
            milestone_name TEXT, quantity NUMERIC, unit_price NUMERIC,
            payment_cycle_pct NUMERIC, cycle_value NUMERIC, documents TEXT,
            payment_terms TEXT, delivery_date TEXT, invoice_no TEXT,
            invoice_date TEXT, invoice_value NUMERIC, payment_received NUMERIC,
            pending_amount NUMERIC, remarks TEXT, status TEXT, credit_period INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS invoices (
            id SERIAL PRIMARY KEY,
            po_number TEXT REFERENCES purchase_orders(po_number) ON DELETE CASCADE,
            line_item_id INTEGER REFERENCES po_line_items(id) ON DELETE CASCADE,
            milestone_id INTEGER REFERENCES po_milestones(id) ON DELETE CASCADE,
            invoice_no TEXT, invoice_date TEXT,
            taxable_value NUMERIC, gst_value NUMERIC, total_value NUMERIC,
            credit_period INTEGER, due_date TEXT,
            payment_received NUMERIC, pending_amount NUMERIC,
            status TEXT, remarks TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS payments (
            id SERIAL PRIMARY KEY,
            invoice_no TEXT NOT NULL,
            po_number TEXT REFERENCES purchase_orders(po_number) ON DELETE CASCADE,
            invoice_date TEXT, taxable_value NUMERIC, gst_value NUMERIC, total_value NUMERIC,
            tds_income_pct NUMERIC DEFAULT 0, tds_gst_pct NUMERIC DEFAULT 0,
            gst_hold_pct NUMERIC DEFAULT 0, other_deduction NUMERIC DEFAULT 0,
            tds_income_amt NUMERIC DEFAULT 0, tds_gst_amt NUMERIC DEFAULT 0,
            gst_hold_amt NUMERIC DEFAULT 0, net_receivable NUMERIC,
            actual_receivable NUMERIC, amount_received NUMERIC,
            payment_date TEXT, payment_mode TEXT,
            customer_remarks TEXT, internal_remarks TEXT, other_deduction_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS leads (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name TEXT, company_name TEXT, email TEXT, status TEXT, value NUMERIC,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            account_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
            title TEXT, type TEXT, description TEXT, due_date TEXT, status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name TEXT, sku TEXT, price NUMERIC, description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS interactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            account_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
            type TEXT, details TEXT, date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS bg_fd_details (
            id SERIAL PRIMARY KEY,
            po_number TEXT REFERENCES purchase_orders(po_number) ON DELETE CASCADE ON UPDATE CASCADE,
            opening_balance_bg_limit NUMERIC, bg_number TEXT, bg_start_date TEXT,
            bg_tenure_dd INTEGER, bg_tenure_mm INTEGER, bg_tenure_yy INTEGER,
            bg_end_date TEXT, bg_percentage NUMERIC, bg_value NUMERIC,
            bg_claim_period_required TEXT, bg_status TEXT,
            bg_claim_period_dd INTEGER, bg_claim_period_mm INTEGER, bg_claim_period_yy INTEGER,
            bg_claim_date TEXT, bg_limit_remaining NUMERIC,
            fd_percentage_on_bg NUMERIC, fd_number TEXT, fd_start_date TEXT,
            fd_margin_actual NUMERIC, fd_maturity_date TEXT, fd_maturity_amount NUMERIC,
            rate_of_interest NUMERIC, fd_status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];
    for (const sql of tables) {
        await client.query(sql);
    }
}

// ── Insert helpers ───────────────────────────────────────────────────────────
async function insertRows(client, table, rows, idColumn = 'id') {
    if (!rows.length) return;
    let count = 0;
    for (const row of rows) {
        // Convert empty strings to null (SQLite allows "", PostgreSQL does not for numeric/integer)
        const sanitized = {};
        for (const [k, v] of Object.entries(row)) {
            sanitized[k] = (v === '' || v === undefined) ? null : v;
        }
        const keys = Object.keys(sanitized);
        const vals = Object.values(sanitized);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
        await client.query(sql, vals);
        count++;
    }
    console.log(`  ✅  ${table}: ${count} rows inserted`);

    // Reset sequence for SERIAL columns
    if (idColumn && rows.length) {
        const maxId = Math.max(...rows.map(r => parseInt(r[idColumn]) || 0));
        if (maxId > 0) {
            await client.query(`SELECT setval(pg_get_serial_sequence('${table}', '${idColumn}'), $1, true)`, [maxId]);
        }
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function migrate() {
    console.log('\n🚀 Starting migration: SQLite → PostgreSQL\n');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('📋  Creating tables...');
        await createTables(client);

        // Read all tables in dependency order
        const users = await sqliteAll('SELECT * FROM users');
        const customers = await sqliteAll('SELECT * FROM customers');
        const contacts = await sqliteAll('SELECT * FROM contacts');
        const pos = await sqliteAll('SELECT * FROM purchase_orders');
        const lineItems = await sqliteAll('SELECT * FROM po_line_items');
        const milestones = await sqliteAll('SELECT * FROM po_milestones');
        const invoices = await sqliteAll('SELECT * FROM invoices');
        const payments = await sqliteAll('SELECT * FROM payments');
        const leads = await sqliteAll('SELECT * FROM leads');
        const tasks = await sqliteAll('SELECT * FROM tasks');
        const products = await sqliteAll('SELECT * FROM products');
        const interactions = await sqliteAll('SELECT * FROM interactions');
        const bgfd = await sqliteAll('SELECT * FROM bg_fd_details');

        console.log('\n📤  Inserting data...');
        await insertRows(client, 'users', users);
        await insertRows(client, 'customers', customers);
        await insertRows(client, 'contacts', contacts);
        await insertRows(client, 'purchase_orders', pos, null); // TEXT primary key
        await insertRows(client, 'po_line_items', lineItems);
        await insertRows(client, 'po_milestones', milestones);
        await insertRows(client, 'invoices', invoices);
        await insertRows(client, 'payments', payments);
        await insertRows(client, 'leads', leads);
        await insertRows(client, 'tasks', tasks);
        await insertRows(client, 'products', products);
        await insertRows(client, 'interactions', interactions);
        await insertRows(client, 'bg_fd_details', bgfd);

        await client.query('COMMIT');
        console.log('\n🎉  Migration complete! All data is in PostgreSQL.\n');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌  Migration failed:', err.message);
        console.error(err);
    } finally {
        client.release();
        sqliteDb.close();
        await pool.end();
    }
}

migrate();
