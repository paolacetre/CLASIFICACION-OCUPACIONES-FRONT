const fs = require('fs');
const path = require('path');
const http = require('http');

const filePath = path.join(__dirname, '..', 'documentos', '2CNO_2024_(2025-06-13).xlsx');
const fileBuffer = fs.readFileSync(filePath);

const boundary = '----FormBoundary' + Date.now();
const fileName = '2CNO_2024_(2025-06-13).xlsx';

const header = Buffer.from(
  `--${boundary}\r\n` +
  `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
);
const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
const body = Buffer.concat([header, fileBuffer, footer]);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/cno/upload',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  },
  timeout: 120000,
};

console.log('Subiendo Excel...');
const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch {
      console.log(data);
    }
  });
});

req.on('error', (e) => { console.error('Error:', e.message); });
req.on('timeout', () => { console.error('Timeout'); req.destroy(); });
req.write(body);
req.end();
