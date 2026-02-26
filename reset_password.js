/**
 * One-time password reset script.
 * Usage: node reset_password.js <email> <newpassword>
 * For Render: set DATABASE_URL in your shell first, e.g.:
 *   $env:DATABASE_URL="postgres://..." ; node reset_password.js Deepa@appolosys.com kala123
 */
require('dotenv').config();
const crypto = require('crypto');

const EMAIL = process.argv[2];
const NEW_PASSWORD = process.argv[3];

if (!EMAIL || !NEW_PASSWORD) {
    console.error('Usage: node reset_password.js <email> <newpassword>');
    process.exit(1);
}

// --- Encryption (same as server.js) ---
let ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY;
if (ENCRYPTION_KEY_RAW) ENCRYPTION_KEY_RAW = ENCRYPTION_KEY_RAW.trim().replace(/^["'](.+)["']$/, '$1');

let ENCRYPTION_KEY;
if (ENCRYPTION_KEY_RAW && ENCRYPTION_KEY_RAW.length === 64) ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_RAW, 'hex');
else if (ENCRYPTION_KEY_RAW && ENCRYPTION_KEY_RAW.length === 44) ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_RAW, 'base64');

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    console.error('ENCRYPTION_KEY is invalid. Check your .env');
    process.exit(1);
}

function encrypt(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return JSON.stringify({ iv: iv.toString('hex'), encryptedData: encrypted, authTag });
}

const encryptedPassword = encrypt(NEW_PASSWORD);

// --- Database ---
const DATABASE_URL = process.env.DATABASE_URL;

if (DATABASE_URL) {
    // Render PostgreSQL
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    pool.query(
        'UPDATE users SET password = $1 WHERE LOWER(email) = LOWER($2) RETURNING id, email',
        [encryptedPassword, EMAIL]
    ).then(result => {
        if (result.rowCount === 0) {
            console.error(`❌ No user found with email: ${EMAIL}`);
        } else {
            console.log(`✅ Password reset for: ${result.rows[0].email} (id: ${result.rows[0].id})`);
            console.log('   They can now log in with the new password.');
        }
        pool.end();
    }).catch(err => {
        console.error('❌ DB Error:', err.message);
        pool.end();
    });
} else {
    // Local SQLite
    const db = require('./database');
    db.run(
        'UPDATE users SET password = ? WHERE LOWER(email) = LOWER(?)',
        [encryptedPassword, EMAIL],
        function (err) {
            if (err) { console.error('❌ DB Error:', err.message); }
            else if (this.changes === 0) { console.error(`❌ No user found with email: ${EMAIL}`); }
            else { console.log(`✅ Password reset for: ${EMAIL}`); console.log('   They can now log in with the new password.'); }
        }
    );
}
