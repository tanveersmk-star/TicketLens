// temp_test.js
const fs = require('fs');

let code = fs.readFileSync('temp.js', 'utf8');

const prefix = `
const window = { addEventListener: () => {}, CONFIG: { role_sentiment_config: {} } };
const document = { 
  getElementById: () => ({ style: {}, classList: { add:()=>{}, remove:()=>{} }, addEventListener: () => {} }),
  querySelectorAll: () => ([]),
  body: { style: {} }
};
const mermaid = { initialize: () => {} };
const localStorage = { getItem: () => null, setItem: () => {} };
const navigator = { clipboard: {} };
const pdfjsLib = { GlobalWorkerOptions: {} };
`;

fs.writeFileSync('temp_test.js', prefix + code);
