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
        const email = `http_test_${Date.now()}@example.com`;
        console.log('1. Registering:', email);
        const regRes = await request('POST', '/register', { email, password: 'old' });
        console.log('   Status:', regRes.status);
        if (regRes.status !== 201) throw new Error('Reg failed: ' + regRes.body);

        const userId = JSON.parse(regRes.body).userId;
        console.log('   User ID:', userId);

        console.log('2. Old Login...');
        const login1 = await request('POST', '/login', { email, password: 'old' });
        if (login1.status !== 200) throw new Error('Login failed');
        console.log('   Success');

        console.log('3. Change Password...');
        const changeRes = await request('PUT', '/change-password', { id: userId, new_password: 'new' });
        console.log('   Status:', changeRes.status);
        if (changeRes.status !== 200) throw new Error('Change failed: ' + changeRes.body);

        console.log('4. Verify Old Login (expect 401)...');
        const loginFail = await request('POST', '/login', { email, password: 'old' });
        console.log('   Status:', loginFail.status);
        if (loginFail.status === 401) {
            console.log('   PASS: Old password rejected');
        } else {
            console.log('   FAIL: Old password accepted/other error');
        }

        console.log('5. Verify New Login (expect 200)...');
        const loginSuccess = await request('POST', '/login', { email, password: 'new' });
        console.log('   Status:', loginSuccess.status);
        if (loginSuccess.status === 200) {
            console.log('   PASS: New password accepted');
            require('fs').writeFileSync('verification_result.txt', 'PASS');
        } else {
            console.log('   FAIL: New password rejected');
            require('fs').writeFileSync('verification_result.txt', 'FAIL: New password rejected');
        }
        process.exit(0);

    } catch (err) {
        console.error('ERROR:', err);
        require('fs').writeFileSync('verification_result.txt', 'FAIL: ' + err.message);
        process.exit(1);
    }
}

verify();
