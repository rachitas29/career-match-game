const xlsx = require('xlsx');
const path = require('path');

const testCases = [
  {
    test_case_id: 'TC001',
    test_case_description: 'Upload a valid PDF file',
    test_case_input: 'file_name: sample.pdf',
    test_case_expected_output: 'File uploaded successfully',
    playwright_status: '',
    playwright_actual_output: '',
    execution_timestamp: ''
  },
  {
    test_case_id: 'TC002',
    test_case_description: 'Upload a large PDF file',
    test_case_input: 'file_name: large.pdf',
    test_case_expected_output: 'File uploaded successfully',
    playwright_status: '',
    playwright_actual_output: '',
    execution_timestamp: ''
  },
  {
    test_case_id: 'TC003',
    test_case_description: 'Reject malware executable upload',
    test_case_input: 'file_name: malware.exe',
    test_case_expected_output: 'File type not allowed',
    playwright_status: '',
    playwright_actual_output: '',
    execution_timestamp: ''
  },
  {
    test_case_id: 'TC004',
    test_case_description: 'Handle empty PDF upload',
    test_case_input: 'file_name: empty.pdf',
    test_case_expected_output: 'File is empty',
    playwright_status: '',
    playwright_actual_output: '',
    execution_timestamp: ''
  },
  {
    test_case_id: 'TC005',
    test_case_description: 'Upload multiple files',
    test_case_input: 'files: [a.pdf, b.docx]',
    test_case_expected_output: 'Files uploaded successfully',
    playwright_status: '',
    playwright_actual_output: '',
    execution_timestamp: ''
  },
  {
    test_case_id: 'TC006',
    test_case_description: 'Upload file with special characters in name',
    test_case_input: 'file_name: @#file!.pdf',
    test_case_expected_output: 'File uploaded successfully',
    playwright_status: '',
    playwright_actual_output: '',
    execution_timestamp: ''
  },
  {
    test_case_id: 'TC007',
    test_case_description: 'Upload secure/password-protected PDF',
    test_case_input: 'file_name: secure.pdf',
    test_case_expected_output: 'File uploaded successfully',
    playwright_status: '',
    playwright_actual_output: '',
    execution_timestamp: ''
  }
];

const ws = xlsx.utils.json_to_sheet(testCases);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
xlsx.writeFile(wb, path.join(__dirname, 'DMS_TestCases.xlsx'));
console.log('DMS_TestCases.xlsx created with', testCases.length, 'test cases.');
