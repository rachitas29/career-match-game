// @ts-check
const { test, expect } = require('@playwright/test');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

// Load Excel test cases
const workbook = xlsx.readFile(path.join(__dirname, '..', 'DMS_TestCases.xlsx'));
const sheet = workbook.Sheets['Sheet1'];
const testCases = xlsx.utils.sheet_to_json(sheet);

const results = [];

for (const tc of testCases) {
    test(tc.test_case_id + ' - ' + tc.test_case_description, async ({ page }) => {
        await page.goto('http://frontdms-teamsync.apps.lab.ocp.lan/');

        let input = tc.test_case_input;
        let expected = tc.test_case_expected_output;
        let actualOutput = '';
        let status = '';

        try {
            // Upload files
            if (input.includes('files:')) {
                const files = input.match(/\[(.*)\]/)[1].split(',').map(f => f.trim());
                const paths = files.map(f => path.join(__dirname, 'files', f));
                await page.setInputFiles('#fileInput', paths);
            } else if (input.includes('file_name:')) {
                const fileName = input.match(/file_name: ([^\s,]+)/)[1];
                await page.setInputFiles('#fileInput', path.join(__dirname, 'files', fileName));
            }

            await page.click('#uploadBtn');

            // Capture success or error
            if (await page.locator('#successMsg').count() > 0) {
                actualOutput = await page.locator('#successMsg').textContent();
            } else if (await page.locator('#errorMsg').count() > 0) {
                actualOutput = await page.locator('#errorMsg').textContent();
            }

            status = actualOutput.includes(expected.split(' OR ')[0]) ? 'Pass' : 'Fail';
        } catch (e) {
            status = 'Fail';
            actualOutput = e.message;
        }

        // Save results
        results.push({
            test_case_id: tc.test_case_id,
            playwright_status: status,
            playwright_actual_output: actualOutput,
            execution_timestamp: new Date().toISOString()
        });
    });
}

// After all tests, update Excel
test.afterAll(async () => {
    const data = xlsx.utils.sheet_to_json(sheet);
    data.forEach(row => {
        const match = results.find(r => r.test_case_id === row.test_case_id);
        if (match) {
            row.playwright_status = match.playwright_status;
            row.playwright_actual_output = match.playwright_actual_output;
            row.execution_timestamp = match.execution_timestamp;
        }
    });
    const newSheet = xlsx.utils.json_to_sheet(data);
    workbook.Sheets['Sheet1'] = newSheet;
    xlsx.writeFile(workbook, path.join(__dirname, '..', 'DMS_TestCases_Updated.xlsx'));
});
