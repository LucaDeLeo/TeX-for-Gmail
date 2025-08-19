const fs = require('fs');
const content = fs.readFileSync('content.js', 'utf8');
const lines = content.split('\n');

let braceCount = 0;
let parenCount = 0;
let inString = false;
let stringChar = null;

for (let lineNum = 0; lineNum < lines.length; lineNum++) {
  const line = lines[lineNum];
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const prevChar = i > 0 ? line[i-1] : '';
    
    // Handle strings
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      if (prevChar !== '\\') {
        inString = true;
        stringChar = char;
      }
    } else if (inString && char === stringChar && prevChar !== '\\') {
      inString = false;
      stringChar = null;
    }
    
    // Count braces and parens outside strings
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      
      if (braceCount < 0 || parenCount < 0) {
        console.log(`Line ${lineNum + 1}: Negative balance - braces: ${braceCount}, parens: ${parenCount}`);
        console.log(`  Content: ${line.substring(0, 80)}`);
        break;
      }
    }
  }
}

console.log(`Final balance - braces: ${braceCount}, parens: ${parenCount}`);