const fs = require('fs');
const path = require('path');
const http = require('http');

const excelPath = path.join(__dirname, '..', '..', 'Perfiles_Ocupacionales_CUOC_2025.xlsx');
console.log('Verificando archivo Excel en:', excelPath);

if (!fs.existsSync(excelPath)) {
  console.error('❌ Archivo no encontrado');
  process.exit(1);
}

console.log('Subiendo Perfiles_Ocupacionales_CUOC_2025.xlsx a http://localhost:3000/cuoc/upload ...');

const fileBuffer = fs.readFileSync(excelPath);
const boundary = '----FormBoundary' + Date.now();
const header = Buffer.from(
  `--${boundary}\r\n` +
  `Content-Disposition: form-data; name="file"; filename="Perfiles_Ocupacionales_CUOC_2025.xlsx"\r\n` +
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
);
const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
const body = Buffer.concat([header, fileBuffer, footer]);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/cuoc/upload',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  },
  timeout: 600000, // 10 min
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`Respuesta del servidor (Status: ${res.statusCode})`);
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log(data.substring(0, 1000));
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Error al subir: ${e.message}`);
});

req.write(body);
req.end();
