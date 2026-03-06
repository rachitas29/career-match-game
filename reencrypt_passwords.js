/**
 * reencrypt_passwords.js
 * Re-encrypts all user passwords in Neon PostgreSQL using the LOCAL encryption key.
 * Run this ONCE, then set Render's ENCRYPTION_KEY to match local .env.
 *
 * Usage:
 *   $env:TARGET_DATABASE_URL="postgres://neon_connection_string"
 *   node reencrypt_passwords.js
 */
require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');

const TARGET_URL = process.env.TARGET_DATABASE_URL;
if (!TARGET_URL) {
    console.error('Set TARGET_DATABASE_URL to your Neon connection string');
    process.exit(1);
}

// Local ENCRYPTION_KEY (from .env)
let KEY_RAW = process.env.ENCRYPTION_KEY;
if (!KEY_RAW) { console.error('ENCRYPTION_KEY missing from .env'); process.exit(1); }
KEY_RAW = KEY_RAW.trim();
const ENCRYPTION_KEY = KEY_RAW.length === 64
    ? Buffer.from(KEY_RAW, 'hex')
    : Buffer.from(KEY_RAW, 'base64');

function decrypt(text) {
    try {
        const { iv, encryptedData, authTag } = JSON.parse(text);
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        return decipher.update(encryptedData, 'hex', 'utf8') + decipher.final('utf8');
    } catch { return null; }
}

function encrypt(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    const encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
    return JSON.stringify({ iv: iv.toString('hex'), encryptedData: encrypted, authTag: cipher.getAuthTag().toString('hex') });
}

const pool = new Pool({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } });

async function run() {
    console.log('\n🔑 Re-encrypting user passwords in Neon...\n');
    const { rows } = await pool.query('SELECT id, email, password FROM users ORDER BY id');

    let ok = 0, skipped = 0;
    for (const user of rows) {
        const pw = user.password;
        if (!pw || !pw.startsWith('{')) {
            console.log(`  ⚠️  ${user.email} — legacy/bcrypt format, skipping`);
            skipped++;
            continue;
        }
        const plain = decrypt(pw);
        if (!plain) {
            console.log(`  ❌  ${user.email} — cannot decrypt (wrong key?), skipping`);
            skipped++;
            continue;
        }
        const newEncrypted = encrypt(plain);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [newEncrypted, user.id]);
        console.log(`  ✅  ${user.email} — re-encrypted`);
        ok++;
    }
    console.log(`\nDone: ${ok} re-encrypted, ${skipped} skipped.\n`);
    await pool.end();
}

run().catch(err => { console.error(err); pool.end(); });
