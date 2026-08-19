# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: upload.spec.js >> TC003 - Reject malware executable upload
- Location: tests\upload.spec.js:15:5

# Error details

```
Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://your-dms-app.com/upload
Call log:
  - navigating to "https://your-dms-app.com/upload", waiting until "load"

```

# Test source

```ts
  1  | // @ts-check
  2  | const { test, expect } = require('@playwright/test');
  3  | const xlsx = require('xlsx');
  4  | const fs = require('fs');
  5  | const path = require('path');
  6  | 
  7  | // Load Excel test cases
  8  | const workbook = xlsx.readFile(path.join(__dirname, '..', 'DMS_TestCases.xlsx'));
  9  | const sheet = workbook.Sheets['Sheet1'];
  10 | const testCases = xlsx.utils.sheet_to_json(sheet);
  11 | 
  12 | const results = [];
  13 | 
  14 | for (const tc of testCases) {
  15 |     test(tc.test_case_id + ' - ' + tc.test_case_description, async ({ page }) => {
> 16 |         await page.goto('https://your-dms-app.com/upload');
     |                    ^ Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://your-dms-app.com/upload
  17 | 
  18 |         let input = tc.test_case_input;
  19 |         let expected = tc.test_case_expected_output;
  20 |         let actualOutput = '';
  21 |         let status = '';
  22 | 
  23 |         try {
  24 |             // Upload files
  25 |             if (input.includes('files:')) {
  26 |                 const files = input.match(/\[(.*)\]/)[1].split(',').map(f => f.trim());
  27 |                 const paths = files.map(f => path.join(__dirname, 'files', f));
  28 |                 await page.setInputFiles('#fileInput', paths);
  29 |             } else if (input.includes('file_name:')) {
  30 |                 const fileName = input.match(/file_name: ([^\s,]+)/)[1];
  31 |                 await page.setInputFiles('#fileInput', path.join(__dirname, 'files', fileName));
  32 |             }
  33 | 
  34 |             await page.click('#uploadBtn');
  35 | 
  36 |             // Capture success or error
  37 |             if (await page.locator('#successMsg').count() > 0) {
  38 |                 actualOutput = await page.locator('#successMsg').textContent();
  39 |             } else if (await page.locator('#errorMsg').count() > 0) {
  40 |                 actualOutput = await page.locator('#errorMsg').textContent();
  41 |             }
  42 | 
  43 |             status = actualOutput.includes(expected.split(' OR ')[0]) ? 'Pass' : 'Fail';
  44 |         } catch (e) {
  45 |             status = 'Fail';
  46 |             actualOutput = e.message;
  47 |         }
  48 | 
  49 |         // Save results
  50 |         results.push({
  51 |             test_case_id: tc.test_case_id,
  52 |             playwright_status: status,
  53 |             playwright_actual_output: actualOutput,
  54 |             execution_timestamp: new Date().toISOString()
  55 |         });
  56 |     });
  57 | }
  58 | 
  59 | // After all tests, update Excel
  60 | test.afterAll(async () => {
  61 |     const data = xlsx.utils.sheet_to_json(sheet);
  62 |     data.forEach(row => {
  63 |         const match = results.find(r => r.test_case_id === row.test_case_id);
  64 |         if (match) {
  65 |             row.playwright_status = match.playwright_status;
  66 |             row.playwright_actual_output = match.playwright_actual_output;
  67 |             row.execution_timestamp = match.execution_timestamp;
  68 |         }
  69 |     });
  70 |     const newSheet = xlsx.utils.json_to_sheet(data);
  71 |     workbook.Sheets['Sheet1'] = newSheet;
  72 |     xlsx.writeFile(workbook, path.join(__dirname, '..', 'DMS_TestCases_Updated.xlsx'));
  73 | });
  74 | 
```