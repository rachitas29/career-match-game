const fetch = require('node-fetch');

async function testCreateCustomer() {
    const user_id = 99999; // Non-existent user ID
    const body = {
        user_id: user_id,
        customer_name: "Test Customer",
        short_name: "TEST",
        msme_status: "No",
        address: "123 Test St",
        gst_number: "22AAAAA0000A1Z5",
        pan_number: "ABCDE1234F",
        org_type: "Private",
        contact_person: "John Doe",
        contact_number: "1234567890",
        email_id: "test@example.com",
        notes: "Test Note"
    };

    try {
        const response = await fetch('http://localhost:3000/api/customers', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        console.log(`Status: ${response.status}`);
        console.log(`Response: ${JSON.stringify(data)}`);

        if (response.status === 401 && data.error.includes('User session invalid')) {
            console.log("PASS: Received expected 401 error for invalid user session.");
        } else {
            console.log("FAIL: Did not receive expected 401 error.");
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testCreateCustomer();
