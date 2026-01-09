const http = require('http');

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api' + path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, body: data });
            });
        });

        req.on('error', (e) => reject(e));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function verify() {
    try {
        console.log('1. Creating interactions test data...');
        // We assume user 1 exists or similar. Lets register a new one to be safe.
        const email = `int_test_${Date.now()}@example.com`;
        const regRes = await request('POST', '/register', { email, password: 'pwd' });
        const userId = JSON.parse(regRes.body).userId;
        console.log('   User ID:', userId);

        // Create Account
        const accRes = await request('POST', '/customers', {
            user_id: userId,
            customer_name: 'Interaction Inc',
            email_id: 'i@example.com'
        });
        const accId = JSON.parse(accRes.body).customerId;
        console.log('   Account ID:', accId);

        // 2. Post Interaction
        console.log('2. Posting Interaction...');
        const intRes = await request('POST', '/interactions', {
            user_id: userId,
            account_id: accId,
            type: 'Call',
            details: 'Discussed project scope'
        });
        console.log('   Status:', intRes.status);
        console.log('   Body:', intRes.body);

        if (intRes.status !== 201) {
            console.error('FAIL: Interaction post failed');
            return;
        }

        // 3. Get Interactions
        console.log('3. Fetching Interactions...');
        const getRes = await request('GET', `/interactions?user_id=${userId}&account_id=${accId}`);
        console.log('   Status:', getRes.status);
        const interactions = JSON.parse(getRes.body).interactions;
        console.log('   Found:', interactions.length);

        if (interactions.length > 0 && interactions[0].details === 'Discussed project scope') {
            console.log('PASS: Interaction verified.');
        } else {
            console.error('FAIL: Interaction not found.');
        }

    } catch (err) {
        console.error('ERROR:', err);
    }
}

verify();
