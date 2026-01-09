const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fetch = require('node-fetch');

const dbPath = path.resolve(__dirname, 'database_v4.sqlite');
const db = new sqlite3.Database(dbPath);

async function runTest() {
    // 1. Create a dummy user and customer directly in DB to avoid auth flow complexity
    const userId = 8888;
    const accountId = 7777;

    await new Promise((resolve, reject) => {
        db.run("INSERT OR IGNORE INTO users (id, email, password) VALUES (?, ?, ?)", [userId, 'test@repro.com', 'pass'], (err) => {
            if (err) reject(err); else resolve();
        });
    });

    await new Promise((resolve, reject) => {
        db.run("INSERT OR IGNORE INTO customers (id, user_id, customer_name) VALUES (?, ?, ?)", [accountId, userId, 'Test Customer'], (err) => {
            if (err) reject(err); else resolve();
        });
    });

    // 2. Post an interaction via API
    console.log('Posting interaction...');
    const body = {
        user_id: userId,
        account_id: accountId,
        type: 'Call',
        details: 'Test call interaction'
    };

    try {
        const response = await fetch('http://localhost:3000/api/interactions', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        console.log('Post Response:', data);

        if (response.status !== 201) {
            console.error('Failed to create interaction');
            return;
        }

        // 3. Fetch interactions and check for date
        console.log('Fetching interactions...');
        const getRes = await fetch(`http://localhost:3000/api/interactions?user_id=${userId}&account_id=${accountId}`);
        const getData = await getRes.json();

        if (getData.interactions && getData.interactions.length > 0) {
            const interaction = getData.interactions[0];
            console.log('Fetched Interaction:', interaction);
            if (!interaction.date) {
                console.log('FAIL: Interaction date is missing!');
            } else {
                console.log('PASS: Interaction date exists:', interaction.date);
            }
        } else {
            console.log('FAIL: No interactions found');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Cleanup not strictly necessary for repro, but good practice
        db.run("DELETE FROM interactions WHERE user_id = ?", [userId]);
        db.run("DELETE FROM customers WHERE id = ?", [accountId]);
        db.run("DELETE FROM users WHERE id = ?", [userId]);
        db.close();
    }
}

runTest();
