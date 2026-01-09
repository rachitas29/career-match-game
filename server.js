const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes - Auth
// Register
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const bcrypt = require('bcrypt');
    const saltRounds = 10;

    bcrypt.hash(password, saltRounds, function (err, hash) {
        if (err) return res.status(500).json({ error: 'Error hashing password' });

        const stmt = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)");
        stmt.run(email, hash, function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'User registered successfully', userId: this.lastID });
        });
        stmt.finalize();
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    console.log('Login Attempt:', email);

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) {
            console.error('DB Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user) {
            console.log('User not found:', email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const bcrypt = require('bcrypt');
        bcrypt.compare(password, user.password, function (err, result) {
            if (result) {
                console.log('Password Match. Login Success.');
                res.json({ message: 'Login successful', user: { id: user.id, email: user.email, name: user.name, phone: user.phone } });
            } else {
                console.log('Password Mismatch.');
                res.status(401).json({ error: 'Invalid email or password' });
            }
        });
    });
});

// User Settings
app.put('/api/user', (req, res) => {
    const { id, name, email, phone } = req.body;
    if (!id) return res.status(400).json({ error: 'User ID required' });

    const sql = `UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?`;
    db.run(sql, [name, email, phone, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Profile updated' });
    });
});

app.put('/api/change-password', (req, res) => {
    const { id, new_password } = req.body;
    if (!id || !new_password) return res.status(400).json({ error: 'User ID and New Password required' });

    const bcrypt = require('bcrypt');
    const saltRounds = 10;

    bcrypt.hash(new_password, saltRounds, function (err, hash) {
        if (err) return res.status(500).json({ error: 'Error hashing password' });

        const sql = `UPDATE users SET password = ? WHERE id = ?`;
        db.run(sql, [hash, id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Password updated successfully' });
        });
    });
});

// Routes - Customers
app.post('/api/customers', (req, res) => {
    const { user_id, unique_client_id, customer_name, short_name, msme_status, address, gst_number, pan_number, org_type, contact_person, contact_number, email_id, notes } = req.body;
    console.log('POST /api/customers:', req.body);

    if (!customer_name || !user_id || !unique_client_id) {
        return res.status(400).json({ error: 'Customer Name, User ID, and Unique Client ID are required' });
    }

    const sql = `INSERT INTO customers (user_id, unique_client_id, customer_name, short_name, msme_status, address, gst_number, pan_number, org_type, contact_person, contact_number, email_id, notes) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [user_id, unique_client_id, customer_name, short_name, msme_status, address, gst_number, pan_number, org_type, contact_person, contact_number, email_id, notes];

    db.run(sql, params, function (err) {
        if (err) {
            if (err.message.includes('FOREIGN KEY constraint failed')) {
                return res.status(401).json({ error: 'User session invalid. Please log in again.' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'Customer created', customerId: this.lastID });
    });
});

app.get('/api/customers', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    db.all("SELECT * FROM customers WHERE user_id = ?", [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ customers: rows });
    });
});

app.get('/api/customers/:id', (req, res) => {
    const { id } = req.params;
    const userId = req.query.user_id;

    if (!userId) return res.status(400).json({ error: 'User ID required' });

    db.get("SELECT * FROM customers WHERE id = ? AND user_id = ?", [id, userId], (err, customer) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!customer) return res.status(404).json({ error: 'Account not found' });
        res.json({ customer });
    });
});

app.put('/api/customers/:id', (req, res) => {
    const { id } = req.params;
    const { user_id, customer_name, short_name, msme_status, address, gst_number, pan_number, org_type, contact_person, contact_number, email_id, notes } = req.body;

    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    const sql = `UPDATE customers SET 
        customer_name = ?, short_name = ?, msme_status = ?, address = ?, gst_number = ?, 
        pan_number = ?, org_type = ?, contact_person = ?, contact_number = ?, email_id = ?, notes = ?
        WHERE id = ? AND user_id = ?`;

    const params = [customer_name, short_name, msme_status, address, gst_number, pan_number, org_type, contact_person, contact_number, email_id, notes, id, user_id];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Account not found or no changes made' });
        res.json({ message: 'Account updated successfully' });
    });
});

// Routes - Contacts
app.post('/api/contacts', (req, res) => {
    const { user_id, account_id, name, email, phone, role } = req.body;
    if (!name || !user_id) return res.status(400).json({ error: 'Name and User ID are required' });

    const sql = `INSERT INTO contacts (user_id, account_id, name, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [user_id, account_id, name, email, phone, role], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Contact created', contactId: this.lastID });
    });
});

app.get('/api/contacts', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    const sql = `
        SELECT contacts.*, customers.customer_name as account_name 
        FROM contacts 
        LEFT JOIN customers ON contacts.account_id = customers.id
        WHERE contacts.user_id = ?`;

    db.all(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ contacts: rows });
    });
});

// Routes - Leads
app.post('/api/leads', (req, res) => {
    const { user_id, name, company_name, email, status, value } = req.body;
    if (!name || !user_id) return res.status(400).json({ error: 'Name and User ID required' });

    const sql = `INSERT INTO leads (user_id, name, company_name, email, status, value) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [user_id, name, company_name, email, status || 'New', value || 0], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Lead created', leadId: this.lastID });
    });
});

app.get('/api/leads', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    db.all("SELECT * FROM leads WHERE user_id = ?", [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ leads: rows });
    });
});

// Routes - Tasks
app.post('/api/tasks', (req, res) => {
    const { user_id, account_id, title, type, description, due_date } = req.body;
    if (!title || !user_id) return res.status(400).json({ error: 'Title and User ID required' });

    const sql = `INSERT INTO tasks (user_id, account_id, title, type, description, due_date) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [user_id, account_id, title, type, description, due_date], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Task created', taskId: this.lastID });
    });
});

app.get('/api/tasks', (req, res) => {
    const userId = req.query.user_id;
    const accountId = req.query.account_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    let sql = "SELECT * FROM tasks WHERE user_id = ?";
    let params = [userId];

    if (accountId) {
        sql += " AND account_id = ?";
        params.push(accountId);
    }
    sql += " ORDER BY due_date ASC";

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ tasks: rows });
    });
});

app.post('/api/tasks/complete', (req, res) => {
    const { id } = req.body;
    db.run("UPDATE tasks SET status = 'Done' WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Task completed' });
    });
});

// Routes - Products
app.post('/api/products', (req, res) => {
    const { user_id, name, sku, price, description } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and Price required' });

    const sql = `INSERT INTO products (user_id, name, sku, price, description) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [user_id, name, sku, price, description], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Product created', productId: this.lastID });
    });
});

app.get('/api/products', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    db.all("SELECT * FROM products WHERE user_id = ?", [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ products: rows });
    });
});

// Routes - Interactions
app.post('/api/interactions', (req, res) => {
    const { user_id, account_id, type, details, date } = req.body;
    if (!account_id || !user_id) return res.status(400).json({ error: 'Account and User ID required' });

    const interactionDate = date || new Date().toISOString();
    const sql = `INSERT INTO interactions (user_id, account_id, type, details, date) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [user_id, account_id, type, details, interactionDate], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Interaction logged', interactionId: this.lastID });
    });
});

// Routes - Purchase Orders
app.post('/api/purchase-orders', (req, res) => {
    console.log('POST /api/purchase-orders:', req.body);
    const { user_id, account_id, client_id, po_number, po_date, po_value, bank_guarantee, bill_to, ship_to, notes, bg_number, bg_expiry_date, bg_bank_name, bg_amount } = req.body;
    if (!user_id || !account_id || !po_number) {
        return res.status(400).json({ error: 'User ID, Account ID, and PO Number are required' });
    }

    const sql = `INSERT INTO purchase_orders (user_id, account_id, client_id, po_number, po_date, po_value, bank_guarantee, bill_to, ship_to, notes, bg_number, bg_expiry_date, bg_bank_name, bg_amount) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [user_id, account_id, client_id, po_number, po_date, po_value, bank_guarantee, bill_to, ship_to, notes, bg_number, bg_expiry_date, bg_bank_name, bg_amount || null], function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed: purchase_orders.po_number')) {
                return res.status(409).json({ error: 'Purchase Order number already exists. Please use a unique PO number.' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'Purchase Order created', po_number: po_number });
    });
});

app.get('/api/purchase-orders/:po_number', (req, res) => {
    const { po_number } = req.params;
    db.get("SELECT * FROM purchase_orders WHERE po_number = ?", [po_number], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Purchase Order not found' });
        res.json({ purchase_order: row });
    });
});

app.put('/api/purchase-orders/:po_number', (req, res) => {
    const { po_number: param_po_number } = req.params;
    const { user_id, account_id, client_id, po_number, po_date, po_value, bank_guarantee, bill_to, ship_to, notes, bg_number, bg_expiry_date, bg_bank_name, bg_amount } = req.body;

    if (!user_id || !account_id || !po_number) {
        return res.status(400).json({ error: 'User ID, Account ID, and PO Number are required' });
    }

    const sql = `UPDATE purchase_orders SET 
        user_id = ?, account_id = ?, client_id = ?, po_number = ?, po_date = ?, 
        po_value = ?, bank_guarantee = ?, bill_to = ?, ship_to = ?, notes = ?, 
        bg_number = ?, bg_expiry_date = ?, bg_bank_name = ?, bg_amount = ?
        WHERE po_number = ?`;

    const params = [user_id, account_id, client_id, po_number, po_date, po_value, bank_guarantee, bill_to, ship_to, notes, bg_number, bg_expiry_date, bg_bank_name, bg_amount || null, param_po_number];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Purchase Order not found' });
        res.json({ message: 'Purchase Order updated' });
    });
});

// BG and FD Details
app.get('/api/purchase-orders/:po_number/bg-fd', (req, res) => {
    const { po_number } = req.params;
    db.get("SELECT * FROM bg_fd_details WHERE po_number = ?", [po_number], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ bg_fd: row || null });
    });
});

app.post('/api/purchase-orders/:po_number/bg-fd', (req, res) => {
    const { po_number } = req.params;
    const {
        opening_balance_bg_limit, bg_number, bg_start_date, bg_tenure_dd, bg_tenure_mm, bg_tenure_yy,
        bg_end_date, bg_percentage, bg_value, bg_claim_period_required, bg_status,
        bg_claim_period_dd, bg_claim_period_mm, bg_claim_period_yy, bg_claim_date, bg_limit_remaining,
        fd_percentage_on_bg, fd_number, fd_start_date, fd_margin_actual, fd_maturity_date, fd_maturity_amount,
        rate_of_interest, fd_status
    } = req.body;

    const sql = `INSERT OR REPLACE INTO bg_fd_details (
        po_number, opening_balance_bg_limit, bg_number, bg_start_date, bg_tenure_dd, bg_tenure_mm, bg_tenure_yy,
        bg_end_date, bg_percentage, bg_value, bg_claim_period_required, bg_status,
        bg_claim_period_dd, bg_claim_period_mm, bg_claim_period_yy, bg_claim_date, bg_limit_remaining,
        fd_percentage_on_bg, fd_number, fd_start_date, fd_margin_actual, fd_maturity_date, fd_maturity_amount,
        rate_of_interest, fd_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
        po_number, opening_balance_bg_limit, bg_number, bg_start_date, bg_tenure_dd, bg_tenure_mm, bg_tenure_yy,
        bg_end_date, bg_percentage, bg_value, bg_claim_period_required, bg_status,
        bg_claim_period_dd, bg_claim_period_mm, bg_claim_period_yy, bg_claim_date, bg_limit_remaining,
        fd_percentage_on_bg, fd_number, fd_start_date, fd_margin_actual, fd_maturity_date, fd_maturity_amount,
        rate_of_interest, fd_status
    ];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'BG/FD details saved', id: this.lastID });
    });
});

app.get('/api/purchase-orders', (req, res) => {
    const { user_id, account_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    let sql = "SELECT * FROM purchase_orders WHERE user_id = ?";
    let params = [user_id];

    if (account_id) {
        sql += " AND account_id = ?";
        params.push(account_id);
    }
    sql += " ORDER BY created_at DESC";

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ purchase_orders: rows });
    });
});

// DELETE Purchase Order (cascades to line items and milestones)
app.delete('/api/purchase-orders/:po_number', (req, res) => {
    const { po_number } = req.params;

    db.run('DELETE FROM purchase_orders WHERE po_number = ?', [po_number], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Purchase Order not found' });
        res.json({ message: 'Purchase Order and all associated data deleted successfully' });
    });
});

// BG/FD Details Endpoints
app.get('/api/purchase-orders/:po_number/bg-fd', (req, res) => {
    const { po_number } = req.params;
    db.get('SELECT * FROM bg_fd_details WHERE po_number = ?', [po_number], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ bg_fd: row });
    });
});

app.post('/api/purchase-orders/:po_number/bg-fd', (req, res) => {
    const { po_number } = req.params;
    const body = req.body;

    // First delete existing (simple upsert strategy)
    db.serialize(() => {
        db.run('DELETE FROM bg_fd_details WHERE po_number = ?', [po_number], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            const sql = `INSERT INTO bg_fd_details (
                po_number, opening_balance_bg_limit, bg_number, bg_start_date, 
                bg_tenure_dd, bg_tenure_mm, bg_tenure_yy, bg_end_date, 
                bg_percentage, bg_value, bg_claim_period_required, bg_status, 
                bg_claim_period_dd, bg_claim_period_mm, bg_claim_period_yy, bg_claim_date, 
                bg_limit_remaining, fd_percentage_on_bg, fd_number, fd_start_date, 
                fd_margin_actual, fd_maturity_date, fd_maturity_amount, rate_of_interest, fd_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            const params = [
                po_number, body.opening_balance_bg_limit, body.bg_number, body.bg_start_date,
                body.bg_tenure_dd, body.bg_tenure_mm, body.bg_tenure_yy, body.bg_end_date,
                body.bg_percentage, body.bg_value, body.bg_claim_period_required, body.bg_status,
                body.bg_claim_period_dd, body.bg_claim_period_mm, body.bg_claim_period_yy, body.bg_claim_date,
                body.bg_limit_remaining, body.fd_percentage_on_bg, body.fd_number, body.fd_start_date,
                body.fd_margin_actual, body.fd_maturity_date, body.fd_maturity_amount, body.rate_of_interest, body.fd_status
            ];

            db.run(sql, params, function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'BG/FD details saved', id: this.lastID });
            });
        });
    });
});


// PO Line Items Endpoints
app.post('/api/purchase-orders/:po_number/line-items', (req, res) => {
    const { po_number } = req.params;
    const { line_item_no, line_item_type, description, quantity, gst_rate, hsn_sac_code, milestones } = req.body;

    // Server-side validation for quantity
    const qty = parseFloat(quantity) || 0;
    if (qty <= 0) {
        return res.status(400).json({ error: 'Qty cannot be empty. Please ensure quantity is greater than 0.' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const poSql = `INSERT INTO po_line_items (po_number, line_item_no, line_item_type, description, quantity, gst_rate, hsn_sac_code) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        db.run(poSql, [po_number, line_item_no, line_item_type, description, qty, gst_rate, hsn_sac_code], function (err) {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
            }

            const lineItemId = this.lastID;
            if (milestones && milestones.length > 0) {
                const milestoneSql = `INSERT INTO po_milestones (line_item_id, milestone_name, quantity, unit_price, payment_cycle_pct, cycle_value, documents, payment_terms, delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                let completed = 0;
                let errorOccurred = false;

                milestones.forEach(m => {
                    db.run(milestoneSql, [lineItemId, m.milestone_name, m.quantity, m.unit_price, m.payment_cycle_pct, m.cycle_value, m.documents, m.payment_terms, m.delivery_date], (err) => {
                        if (err && !errorOccurred) {
                            errorOccurred = true;
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: err.message });
                        }
                        completed++;
                        if (completed === milestones.length && !errorOccurred) {
                            db.run('COMMIT');
                            res.json({ message: 'Line item and milestones saved', id: lineItemId });
                        }
                    });
                });
            } else {
                db.run('COMMIT');
                res.json({ message: 'Line item saved', id: lineItemId });
            }
        });
    });
});

app.get('/api/purchase-orders/:po_number/line-items', (req, res) => {
    const { po_number } = req.params;
    const sql = `
        SELECT li.*, 
               (SELECT json_group_array(
                   json_object(
                       'id', m.id,
                       'milestone_name', m.milestone_name,
                       'quantity', m.quantity,
                       'unit_price', m.unit_price,
                       'payment_cycle_pct', m.payment_cycle_pct,
                       'cycle_value', m.cycle_value,
                       'documents', m.documents,
                       'payment_terms', m.payment_terms,
                       'delivery_date', m.delivery_date
                   )
               ) FROM po_milestones m WHERE m.line_item_id = li.id) as milestones
        FROM po_line_items li
        WHERE li.po_number = ?
    `;

    db.all(sql, [po_number], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Parse the milestones JSON column
        const processedRows = rows.map(row => ({
            ...row,
            milestones: JSON.parse(row.milestones)
        }));

        res.json({ line_items: processedRows });
    });
});

app.delete('/api/line-items/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM po_line_items WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Line item deleted' });
    });
});

app.delete('/api/milestones/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM po_milestones WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Milestone deleted' });
    });
});

app.put('/api/line-items/:id', (req, res) => {
    const { id } = req.params;
    const { line_item_no, line_item_type, description, quantity, gst_rate, hsn_sac_code, milestones } = req.body;

    // Server-side validation for quantity
    const qty = parseFloat(quantity) || 0;
    if (qty <= 0) {
        return res.status(400).json({ error: 'Qty cannot be empty. Please ensure quantity is greater than 0.' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const sql = `UPDATE po_line_items SET line_item_no = ?, line_item_type = ?, description = ?, quantity = ?, gst_rate = ?, hsn_sac_code = ? WHERE id = ?`;
        db.run(sql, [line_item_no, line_item_type, description, qty, gst_rate, hsn_sac_code, id], function (err) {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
            }

            // Simple approach: Delete old milestones and insert new ones
            db.run('DELETE FROM po_milestones WHERE line_item_id = ?', [id], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }

                if (milestones && milestones.length > 0) {
                    const milestoneSql = `INSERT INTO po_milestones (line_item_id, milestone_name, quantity, unit_price, payment_cycle_pct, cycle_value, documents, payment_terms, delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                    let completed = 0;
                    let errorOccurred = false;

                    milestones.forEach(m => {
                        db.run(milestoneSql, [id, m.milestone_name, m.quantity, m.unit_price, m.payment_cycle_pct, m.cycle_value, m.documents, m.payment_terms, m.delivery_date], (err) => {
                            if (err && !errorOccurred) {
                                errorOccurred = true;
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: err.message });
                            }
                            completed++;
                            if (completed === milestones.length && !errorOccurred) {
                                db.run('COMMIT');
                                res.json({ message: 'Line item updated' });
                            }
                        });
                    });
                } else {
                    db.run('COMMIT');
                    res.json({ message: 'Line item updated' });
                }
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
