require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Routes - Auth
// Register
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const bcrypt = require('bcryptjs');
    const saltRounds = 10;

    bcrypt.hash(password, saltRounds, function (err, hash) {
        if (err) return res.status(500).json({ error: 'Error hashing password' });

        const stmt = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)");
        stmt.run([email, hash], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed') || err.message.toLowerCase().includes('duplicate key') || err.message.toLowerCase().includes('unique constraint')) {
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

        const bcrypt = require('bcryptjs');
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

    const bcrypt = require('bcryptjs');
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
    const accountId = req.query.account_id;

    if (!userId) return res.status(400).json({ error: 'User ID required' });

    let sql = `
        SELECT contacts.*, customers.customer_name as account_name 
        FROM contacts 
        LEFT JOIN customers ON contacts.account_id = customers.id
        WHERE contacts.user_id = ?`;

    const params = [userId];

    if (accountId) {
        sql += " AND contacts.account_id = ?";
        params.push(accountId);
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ contacts: rows });
    });
});

app.get('/api/contacts/:id', (req, res) => {
    const { id } = req.params;
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    db.get("SELECT * FROM contacts WHERE id = ? AND user_id = ?", [id, userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Contact not found' });
        res.json({ contact: row });
    });
});

app.put('/api/contacts/:id', (req, res) => {
    const { id } = req.params;
    const { user_id, account_id, name, email, phone, role } = req.body;

    if (!name || !user_id) return res.status(400).json({ error: 'Name and User ID are required' });

    const sql = `UPDATE contacts SET account_id = ?, name = ?, email = ?, phone = ?, role = ? WHERE id = ? AND user_id = ?`;
    db.run(sql, [account_id, name, email, phone, role, id, user_id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Contact not found or no changes made' });
        res.json({ message: 'Contact updated successfully' });
    });
});

// Routes - Leads
app.post('/api/leads', (req, res) => {
    const { user_id, name, company_name, email, status, value } = req.body;
    if (!name || !user_id) return res.status(400).json({ error: 'Name and User ID are required' });

    const sql = `INSERT INTO leads (user_id, name, company_name, email, status, value) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [user_id, name, company_name, email, status, value], function (err) {
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
    const { user_id, account_id, title, type, description, due_date, status } = req.body;
    if (!title || !user_id) return res.status(400).json({ error: 'Title and User ID are required' });

    const sql = `INSERT INTO tasks (user_id, account_id, title, type, description, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [user_id, account_id, title, type, description, due_date, status], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Task created', taskId: this.lastID });
    });
});

app.get('/api/tasks', (req, res) => {
    const userId = req.query.user_id;
    const accountId = req.query.account_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    let sql = `
        SELECT tasks.*, customers.customer_name as account_name 
        FROM tasks 
        LEFT JOIN customers ON tasks.account_id = customers.id
        WHERE tasks.user_id = ?`;
    let params = [userId];

    if (accountId) {
        sql += " AND tasks.account_id = ?";
        params.push(accountId);
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ tasks: rows });
    });
});

app.put('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.run("UPDATE tasks SET status = ? WHERE id = ?", [status, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Task updated' });
    });
});

// Routes - Products
app.post('/api/products', (req, res) => {
    const { user_id, name, sku, price, description } = req.body;
    if (!name || !user_id) return res.status(400).json({ error: 'Product Name and User ID are required' });

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
    if (!type || !user_id) return res.status(400).json({ error: 'Type and User ID are required' });

    const sql = `INSERT INTO interactions (user_id, account_id, type, details, date) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [user_id, account_id, type, details, date || new Date().toISOString()], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Interaction logged', interactionId: this.lastID });
    });
});

app.get('/api/interactions', (req, res) => {
    const userId = req.query.user_id;
    const accountId = req.query.account_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    let sql = `
        SELECT interactions.*, customers.customer_name as account_name 
        FROM interactions 
        LEFT JOIN customers ON interactions.account_id = customers.id
        WHERE interactions.user_id = ?`;
    let params = [userId];

    if (accountId) {
        sql += " AND interactions.account_id = ?";
        params.push(accountId);
    }
    sql += " ORDER BY date DESC";

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ interactions: rows });
    });
});

// Purchase Orders Routes
app.post('/api/purchase-orders', (req, res) => {
    const { user_id, account_id, client_id, po_number, po_date, po_value, bank_guarantee, bill_to, ship_to, notes, bg_number, bg_expiry_date, bg_bank_name, bg_amount, contact_id, project_name } = req.body;

    if (!po_number || !user_id) {
        return res.status(400).json({ error: 'PO Number and User ID are required' });
    }

    const sql = `INSERT INTO purchase_orders (po_number, user_id, account_id, client_id, po_date, po_value, bank_guarantee, bill_to, ship_to, notes, bg_number, bg_expiry_date, bg_bank_name, bg_amount, contact_id, project_name) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [po_number, user_id, account_id, client_id, po_date, po_value, bank_guarantee, bill_to, ship_to, notes, bg_number, bg_expiry_date, bg_bank_name, bg_amount, contact_id, project_name];

    db.run(sql, params, function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'PO Number already exists' });
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

app.get('/api/purchase-orders', (req, res) => {
    const userId = req.query.user_id;
    const account_id = req.query.account_id;

    if (!userId) return res.status(400).json({ error: 'User ID required' });

    let sql = `SELECT purchase_orders.*, customers.customer_name 
               FROM purchase_orders 
               LEFT JOIN customers ON purchase_orders.account_id = customers.id
               WHERE purchase_orders.user_id = ?`;
    let params = [userId];

    if (account_id) {
        sql += " AND purchase_orders.account_id = ?";
        params.push(account_id);
    }
    sql += " ORDER BY purchase_orders.created_at DESC";

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ purchase_orders: rows });
    });
});

app.put('/api/purchase-orders/:po_number', (req, res) => {
    const { po_number } = req.params;
    const { po_date, po_value, bank_guarantee, bill_to, ship_to, notes, account_id, client_id, user_id, po_number: new_po_number, contact_id, project_name } = req.body;

    const sql = `UPDATE purchase_orders SET 
        po_number = ?, po_date = ?, po_value = ?, bank_guarantee = ?, bill_to = ?, ship_to = ?, notes = ?, account_id = ?, client_id = ?, contact_id = ?, project_name = ?
        WHERE po_number = ? AND user_id = ?`;

    const params = [new_po_number || po_number, po_date, po_value, bank_guarantee, bill_to, ship_to, notes, account_id, client_id, contact_id, project_name, po_number, user_id];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Purchase Order not found or no changes made' });
        res.json({ message: 'Purchase Order updated successfully', po_number: new_po_number || po_number });
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

app.delete('/api/purchase-orders/:po_number/bg-fd', (req, res) => {
    const { po_number } = req.params;
    console.log('[DELETE BG] Starting delete for PO:', po_number);

    db.run('DELETE FROM bg_fd_details WHERE po_number = ?', [po_number], function (err) {
        if (err) {
            console.error('[DELETE BG] Error deleting from bg_fd_details:', err);
            return res.status(500).json({ error: err.message });
        }

        console.log('[DELETE BG] Successfully deleted', this.changes, 'rows from bg_fd_details');

        // Also update the purchase_orders table to set bank_guarantee = 'No'
        console.log('[DELETE BG] Now updating purchase_orders table...');
        db.run('UPDATE purchase_orders SET bank_guarantee = ? WHERE po_number = ?',
            ['No', po_number],
            function (updateErr) {
                if (updateErr) {
                    console.error('[DELETE BG] ERROR updating PO bank_guarantee:', updateErr);
                } else {
                    console.log('[DELETE BG] Successfully updated purchase_orders, rows affected:', this.changes);
                }
                res.json({ message: 'BG/FD details deleted successfully' });
            }
        );
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

                // Also update the purchase_orders table to set bank_guarantee = 'Yes'
                db.run('UPDATE purchase_orders SET bank_guarantee = ? WHERE po_number = ?',
                    ['Yes', po_number],
                    (updateErr) => {
                        if (updateErr) {
                            console.error('Error updating PO bank_guarantee:', updateErr);
                            // Don't fail the request, just log the error
                        }
                        res.json({ message: 'BG/FD details saved', id: this.lastID });
                    }
                );
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
                const milestoneSql = `INSERT INTO po_milestones (
                    line_item_id, milestone_name, quantity, unit_price, payment_cycle_pct, 
                    cycle_value, documents, payment_terms, delivery_date, 
                    invoice_no, invoice_date, invoice_value, payment_received, pending_amount, remarks,
                    status, credit_period
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                let completed = 0;
                let errorOccurred = false;

                milestones.forEach(m => {
                    const mParams = [
                        lineItemId, m.milestone_name, m.quantity, m.unit_price, m.payment_cycle_pct,
                        m.cycle_value, m.documents, m.payment_terms, m.delivery_date,
                        m.invoice_no || null, m.invoice_date || null, m.invoice_value || 0,
                        m.payment_received || 0, m.pending_amount || 0, m.remarks || null,
                        m.status || 'Pending', m.credit_period || 0
                    ];
                    db.run(milestoneSql, mParams, (err) => {
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
    const sql = db.isPostgres ? `
        SELECT li.*, 
               (SELECT json_agg(
                   json_build_object(
                       'id', m.id,
                       'milestone_name', m.milestone_name,
                       'quantity', m.quantity,
                       'unit_price', m.unit_price,
                       'payment_cycle_pct', m.payment_cycle_pct,
                       'cycle_value', m.cycle_value,
                       'documents', m.documents,
                       'payment_terms', m.payment_terms,
                       'delivery_date', m.delivery_date,
                       'invoice_no', m.invoice_no,
                       'invoice_date', m.invoice_date,
                       'invoice_value', m.invoice_value,
                       'payment_received', m.payment_received,
                       'pending_amount', m.pending_amount,
                       'remarks', m.remarks,
                       'credit_period', COALESCE(m.credit_period, 0)
                   )
               ) FROM po_milestones m WHERE m.line_item_id = li.id) as milestones
        FROM po_line_items li
        WHERE li.po_number = ?
    ` : `
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
                       'delivery_date', m.delivery_date,
                       'invoice_no', m.invoice_no,
                       'invoice_date', m.invoice_date,
                       'invoice_value', m.invoice_value,
                       'payment_received', m.payment_received,
                       'pending_amount', m.pending_amount,
                       'remarks', m.remarks,
                       'credit_period', COALESCE(m.credit_period, 0)
                   )
               ) FROM po_milestones m WHERE m.line_item_id = li.id ORDER BY m.created_at ASC) as milestones
        FROM po_line_items li
        WHERE li.po_number = ?
        ORDER BY li.created_at ASC, li.id ASC
    `;

    db.all(sql, [po_number], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Parse the milestones JSON column (SQLite returns string, Postgres returns object)
        const processedRows = rows.map(row => ({
            ...row,
            milestones: typeof row.milestones === 'string' ? JSON.parse(row.milestones) : (row.milestones || [])
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

            if (!milestones || milestones.length === 0) {
                // If no milestones, delete existing ones for this line item
                db.run('DELETE FROM po_milestones WHERE line_item_id = ?', [id], (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: err.message });
                    }
                    db.run('COMMIT');
                    res.json({ message: 'Line item updated' });
                });
                return;
            }

            // Get existing milestones to differentiate between update and insert
            db.all('SELECT id FROM po_milestones WHERE line_item_id = ?', [id], (err, existingMilestones) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }

                const existingIds = existingMilestones.map(m => m.id);
                const incomingIds = milestones.map(m => m.id).filter(id => id);
                const toDelete = existingIds.filter(eid => !incomingIds.includes(eid));

                const milestoneInsertSql = `INSERT INTO po_milestones (
                    line_item_id, milestone_name, quantity, unit_price, payment_cycle_pct, 
                    cycle_value, documents, payment_terms, delivery_date,
                    invoice_no, invoice_date, invoice_value, payment_received, pending_amount, remarks,
                    status, credit_period
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                const milestoneUpdateSql = `UPDATE po_milestones SET 
                    milestone_name = ?, quantity = ?, unit_price = ?, payment_cycle_pct = ?, 
                    cycle_value = ?, documents = ?, payment_terms = ?, delivery_date = ?,
                    invoice_no = ?, invoice_date = ?, invoice_value = ?, payment_received = ?, pending_amount = ?, remarks = ?,
                    status = ?, credit_period = ?
                    WHERE id = ?`;

                let completedCount = 0;
                let errorOccurred = false;

                const finalizeUpdate = () => {
                    completedCount++;
                    if (completedCount === (milestones.length + (toDelete.length > 0 ? 1 : 0)) && !errorOccurred) {
                        db.run('COMMIT');
                        res.json({ message: 'Line item and milestones updated' });
                    }
                };

                // Delete removed milestones
                if (toDelete.length > 0) {
                    const deleteSql = `DELETE FROM po_milestones WHERE id IN (${toDelete.join(',')})`;
                    db.run(deleteSql, (err) => {
                        if (err && !errorOccurred) {
                            errorOccurred = true;
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: err.message });
                        }
                        finalizeUpdate();
                    });
                }


                // Update/Insert milestones
                milestones.forEach(m => {
                    if (errorOccurred) return;

                    if (m.id && existingIds.includes(m.id)) {
                        // Update
                        const mParams = [
                            m.milestone_name, m.quantity, m.unit_price, m.payment_cycle_pct,
                            m.cycle_value, m.documents, m.payment_terms, m.delivery_date,
                            m.invoice_no || null, m.invoice_date || null, m.invoice_value || 0,
                            m.payment_received || 0, m.pending_amount || 0, m.remarks || null,
                            m.status || 'Pending', m.credit_period || 0,
                            m.id
                        ];
                        db.run(milestoneUpdateSql, mParams, (err) => {
                            if (err && !errorOccurred) {
                                errorOccurred = true;
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: err.message });
                            }
                            finalizeUpdate();
                        });
                    } else {
                        // Insert
                        const mParams = [
                            id, m.milestone_name, m.quantity, m.unit_price, m.payment_cycle_pct,
                            m.cycle_value, m.documents, m.payment_terms, m.delivery_date,
                            m.invoice_no || null, m.invoice_date || null, m.invoice_value || 0,
                            m.payment_received || 0, m.pending_amount || 0, m.remarks || null,
                            m.status || 'Pending', m.credit_period || 0
                        ];
                        db.run(milestoneInsertSql, mParams, (err) => {
                            if (err && !errorOccurred) {
                                errorOccurred = true;
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: err.message });
                            }
                            finalizeUpdate();
                        });
                    }
                });
            });
        });
    });
});

app.post('/api/purchase-orders/:po_number/invoices', (req, res) => {
    const { po_number } = req.params;
    const invoices = req.body;

    if (!Array.isArray(invoices) || invoices.length === 0) {
        return res.status(400).json({ error: 'Invoices must be a non-empty array' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION', (err) => {
            if (err) return res.status(500).json({ error: 'Failed to start transaction: ' + err.message });

            let processed = 0;
            let errorOccurred = false;

            const rollback = (errMsg) => {
                if (errorOccurred) return;
                errorOccurred = true;
                db.run('ROLLBACK', () => {
                    if (!res.headersSent) res.status(500).json({ error: errMsg });
                });
            };

            invoices.forEach(inv => {
                if (errorOccurred) return;

                const mId = (inv.milestone_id && inv.milestone_id !== 'undefined' && inv.milestone_id !== 'null') ? inv.milestone_id : null;
                const liId = (inv.line_item_id && inv.line_item_id !== 'undefined' && inv.line_item_id !== 'null') ? inv.line_item_id : null;

                const checkSql = `SELECT id FROM invoices WHERE (milestone_id = ? AND milestone_id IS NOT NULL) OR (line_item_id = ? AND milestone_id IS NULL)`;
                const checkParams = [mId, liId];

                db.get(checkSql, checkParams, (err, existingRow) => {
                    if (err) return rollback('Check error: ' + err.message);
                    if (errorOccurred) return;

                    if (existingRow) {
                        const updateInvoicesSql = `UPDATE invoices SET 
                            invoice_no = ?, invoice_date = ?, 
                            taxable_value = ?, gst_value = ?, total_value = ?, credit_period = ?, 
                            due_date = ?, payment_received = ?, pending_amount = ?, status = ?, remarks = ?
                            WHERE id = ?`;

                        const updateParams = [
                            inv.invoice_no, inv.invoice_date,
                            inv.taxable_value || 0, inv.gst_value || 0, inv.total_value || 0, inv.credit_period || 0,
                            inv.due_date, inv.payment_received || 0, inv.pending_amount || 0, inv.status, inv.remarks,
                            existingRow.id
                        ];

                        db.run(updateInvoicesSql, updateParams, function (err) {
                            if (err) return rollback('Invoices update error: ' + err.message);
                            if (this.changes === 0) {
                                console.warn(`No invoice record updated for ID ${existingRow.id}. This may be an error.`);
                            }
                            handleMilestoneUpdate();
                        });
                    } else {
                        const params = [
                            po_number, liId, mId,
                            inv.invoice_no, inv.invoice_date,
                            inv.taxable_value || 0, inv.gst_value || 0, inv.total_value || 0, inv.credit_period || 0,
                            inv.due_date, inv.payment_received || 0, inv.pending_amount || 0, inv.status, inv.remarks
                        ];

                        const insertSql = `INSERT INTO invoices (
                            po_number, line_item_id, milestone_id, invoice_no, invoice_date, 
                            taxable_value, gst_value, total_value, credit_period, 
                            due_date, payment_received, pending_amount, status, remarks
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                        db.run(insertSql, params, function (err) {
                            if (err) return rollback('Invoices insert error: ' + err.message);
                            handleMilestoneUpdate();
                        });
                    }

                    function handleMilestoneUpdate() {
                        if (errorOccurred) return;

                        const finalize = () => {
                            processed++;
                            if (processed === invoices.length && !errorOccurred) {
                                db.run('COMMIT', (err) => {
                                    if (err) return rollback('Commit error: ' + err.message);
                                    res.json({ message: 'Invoices and milestones updated', count: processed });
                                });
                            }
                        };

                        if (mId) {
                            const updateSql = `UPDATE po_milestones SET 
                                invoice_no = ?, invoice_date = ?, invoice_value = ?, 
                                payment_received = ?, pending_amount = ?, remarks = ?,
                                status = ?, credit_period = ?
                                WHERE id = ?`;
                            db.run(updateSql, [
                                inv.invoice_no, inv.invoice_date, inv.total_value,
                                inv.payment_received, inv.pending_amount, inv.remarks || '',
                                inv.status || 'Pending', inv.credit_period || 0,
                                mId
                            ], function (err) {
                                if (err) return rollback('Milestone update error: ' + err.message);
                                finalize();
                            });
                        } else if (liId) {
                            const updateSql = `UPDATE po_line_items SET 
                                invoice_no = ?, invoice_date = ?, invoice_value = ?, 
                                payment_received = ?, pending_amount = ?, remarks = ?
                                WHERE id = ?`;
                            db.run(updateSql, [
                                inv.invoice_no, inv.invoice_date, inv.total_value,
                                inv.payment_received, inv.pending_amount, inv.remarks,
                                liId
                            ], function (err) {
                                if (err) return rollback('Line item update error: ' + err.message);
                                finalize();
                            });
                        } else {
                            finalize();
                        }
                    }
                });
            });
        });
    });
});

app.get('/api/purchase-orders/:po_number/invoices', (req, res) => {
    const { po_number } = req.params;
    const sql = `SELECT * FROM invoices WHERE po_number = ?`;
    db.all(sql, [po_number], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ invoices: rows });
    });
});

// Payments API Endpoints
app.post('/api/payments', (req, res) => {
    const body = req.body;

    if (!body.invoice_no) {
        return res.status(400).json({ error: 'Invoice number is required' });
    }

    const sql = `INSERT INTO payments (
        invoice_no, po_number, invoice_date, taxable_value, gst_value, total_value,
        tds_income_pct, tds_gst_pct, gst_hold_pct, other_deduction,
        tds_income_amt, tds_gst_amt, gst_hold_amt,
        net_receivable, actual_receivable, amount_received,
        payment_date, payment_mode, customer_remarks, internal_remarks, other_deduction_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
        body.invoice_no, body.po_number, body.invoice_date,
        body.taxable_value || 0, body.gst_value || 0, body.total_value || 0,
        body.tds_income_pct || 0, body.tds_gst_pct || 0, body.gst_hold_pct || 0, body.other_deduction || 0,
        body.tds_income_amt || 0, body.tds_gst_amt || 0, body.gst_hold_amt || 0,
        body.net_receivable || 0, body.actual_receivable || 0, body.amount_received || 0,
        body.payment_date, body.payment_mode, body.customer_remarks, body.internal_remarks, body.other_deduction_type
    ];

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Payment recorded', id: this.lastID });
    });
});

app.get('/api/payments', (req, res) => {
    const { invoice_no, po_number } = req.query;
    let sql = 'SELECT * FROM payments WHERE 1=1';
    const params = [];

    if (invoice_no) {
        sql += ' AND invoice_no = ?';
        params.push(invoice_no);
    }
    if (po_number) {
        sql += ' AND po_number = ?';
        params.push(po_number);
    }
    sql += ' ORDER BY created_at DESC';

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ payments: rows });
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        path: req.url
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
