const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const http = require('http');

console.log("--- Diagnostic Start ---");

// 1. Check DB Users
const dbPath = path.resolve(__dirname, 'database_v3.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("DB Error:", err.message);
        return;
    }

    db.all("SELECT id, email, password FROM users", [], (err, rows) => {
        if (err) {
            console.error("Query Error:", err.message);
            return;
        }
        console.log(`Found ${rows.length} users in DB:`);
        rows.forEach(r => console.log(`- ID: ${r.id}, Email: ${r.email}, PwdHash: ${r.password.substring(0, 10)}...`));

        if (rows.length === 0) {
            console.log("No users found. Login will definitely fail.");
        } else {
            // 2. Try Login with first user (assuming password '123456' or similar from testing)
            // We can't know the user's password, so we just check if the server is up.
            testServer();
        }
    });
});

function testServer() {
    console.log("\n--- Testing Server Connectivity ---");
    const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/customers?user_id=1', // Auth check usually happens here but this is just connectivity
        method: 'GET'
    }, (res) => {
        console.log(`Server responded with Status: ${res.statusCode}`);
        console.log("Server is running.");
    });

    req.on('error', (e) => {
        console.error(`Status: Server unreachable or error: ${e.message}`);
    });

    req.end();
}
