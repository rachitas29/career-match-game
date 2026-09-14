const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const masterFile = path.join(rootDir, 'index.html');
const masterContent = fs.readFileSync(masterFile, 'utf8');

const targetFiles = [
  path.join(rootDir, 'public', 'index.html'),
  path.join(rootDir, 'AngelBot_AI_Challenge.html'),
  path.join(rootDir, 'public', 'AngelBot_AI_Challenge.html'),
  path.join(rootDir, 'AngelBot_B2B_Revenue_Challenge_Final.html'),
  path.join(rootDir, 'public', 'AngelBot_B2B_Revenue_Challenge_Final.html')
];

targetFiles.forEach(target => {
  fs.writeFileSync(target, masterContent, 'utf8');
  console.log('Synced:', target);
});
