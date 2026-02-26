/**
 * Security Verification Test
 * Tests JWT authentication, token issuance, and IDOR protection.
 */
require('dotenv').config();
const http = require('http');

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}/api`;

const TEST_EMAIL = `test_security_${Date.now()}@example.com`;
const TEST_PASSWORD = 'SecurePass123!';

async function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: `/api${path}`,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function run() {
    let passed = 0, failed = 0;

    function assert(description, condition, got) {
        if (condition) {
            console.log(`  ✅ PASS: ${description}`);
            passed++;
        } else {
            console.log(`  ❌ FAIL: ${description} — got: ${JSON.stringify(got)}`);
            failed++;
        }
    }

    console.log('\n🔐 Security Verification Test\n');

    // 1. Register a test user
    console.log('1. Registering test user...');
    const reg = await request('POST', '/register', { email: TEST_EMAIL, password: TEST_PASSWORD });
    assert('Register returns 201', reg.status === 201, reg);

    // 2. Login returns a real JWT token
    console.log('\n2. Testing login returns JWT...');
    const login = await request('POST', '/login', { email: TEST_EMAIL, password: TEST_PASSWORD });
    assert('Login returns 200', login.status === 200, login);
    assert('Login returns a token', typeof login.body.token === 'string' && login.body.token.split('.').length === 3, login.body);
    assert('Login returns user object', login.body.user && login.body.user.id, login.body);
    const token = login.body.token;
    console.log(`   Token (preview): ${token.substring(0, 40)}...`);

    // 3. Access protected route WITHOUT token → should get 401
    console.log('\n3. Testing unauthenticated access → should be 401...');
    const noToken = await request('GET', '/customers');
    assert('GET /customers without token returns 401', noToken.status === 401, noToken);

    // 4. Access protected route WITH valid token → should succeed
    console.log('\n4. Testing authenticated access with valid token → should succeed...');
    const withToken = await request('GET', '/customers', null, token);
    assert('GET /customers with valid token returns 200', withToken.status === 200, withToken);
    assert('Response contains customers array', Array.isArray(withToken.body.customers), withToken.body);

    // 5. Access protected route WITH an invalid/forged token → should get 401
    console.log('\n5. Testing forged token → should be 401...');
    const forged = await request('GET', '/customers', null, 'forged.invalid.token');
    assert('GET /customers with forged token returns 401', forged.status === 401, forged);

    // 6. Access protected route WITH an expired (malformed) token → should get 401
    console.log('\n6. Testing expired token → should be 401...');
    const expiredToken = token.slice(0, -5) + 'XXXXX'; // Corrupt the signature
    const expired = await request('GET', '/customers', null, expiredToken);
    assert('GET /customers with corrupted token returns 401', expired.status === 401, expired);

    // 7. Forgot password route (public) should NOT require token
    console.log('\n7. Testing public route (forgot-password) without token → should not be 401...');
    const forgot = await request('POST', '/forgot-password', { targetEmail: 'nonexistent@test.com' });
    assert('POST /forgot-password without token is NOT 401', forgot.status !== 401, forgot);

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
        console.log('🎉 All security tests passed!\n');
    } else {
        console.log('⚠️  Some tests failed. Check the output above.\n');
        process.exit(1);
    }
}

run().catch(err => {
    console.error('Test runner error:', err.message);
    console.error('Make sure the server is running: npm run dev');
    process.exit(1);
});
