const fs = require('fs');
const path = require('path');

const targetFiles = [
  path.join(__dirname, 'index.html'),
  path.join(__dirname, 'public', 'index.html'),
  path.join(__dirname, 'AngelBot_AI_Challenge.html'),
  path.join(__dirname, 'public', 'AngelBot_AI_Challenge.html'),
  path.join(__dirname, 'AngelBot_B2B_Revenue_Challenge_Final.html'),
  path.join(__dirname, 'public', 'AngelBot_B2B_Revenue_Challenge_Final.html')
];

const newHtml = `      <!-- Clean Direct Email Submission Card (No Buttons or Outer Boundaries) -->
      <div style="text-align: center; margin-top: 10px; padding: 18px 24px;">
        <div style="font-size: 20px; font-weight: 800; color: #ffffff; margin-bottom: 6px; letter-spacing: 0.2px;">
          ✉️ Ready to Submit Your Application!
        </div>
        <div style="font-size: 16px; font-weight: 700; color: var(--text-dim); line-height: 1.6;">
          Please send your resume & profile directly to: <a href="mailto:info@angelbot.ai?subject=Application%20for%20IT%20Presales%2F%20B2B%20Sales%20%2FPaid%20Internship%20Marketing%20%E2%80%94%20AngelBot%20AI%20(Incubated%20%26%20Funded%20by%20ONGC%20Startup%20Fund)" style="color: var(--green); text-decoration: underline; font-weight: 900; font-size: 18px;">info@angelbot.ai</a>
        </div>
      </div>`;

targetFiles.forEach(filePath => {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // Match the block from line 1788 to 1796
  const oldBlockRegex = /<!-- Primary Action: Send Application Now Section \(BELOW Marks Section\) -->[\s\S]*?<\/div>\s*<\/div>/;
  
  if (oldBlockRegex.test(content)) {
    content = content.replace(oldBlockRegex, newHtml);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated:', filePath);
  } else {
    // Try broader replacement if header was slightly different
    const broaderRegex = /<div style="background: linear-gradient\(145deg, rgba\(50, 173, 255, 0\.08\)[\s\S]*?<\/button>\s*<\/div>\s*<div id="applySuccessBox"[\s\S]*?<\/div>\s*<\/div>/;
    if (broaderRegex.test(content)) {
      content = content.replace(broaderRegex, newHtml);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated (broader):', filePath);
    } else {
      console.log('Match not found for:', filePath);
    }
  }
});
