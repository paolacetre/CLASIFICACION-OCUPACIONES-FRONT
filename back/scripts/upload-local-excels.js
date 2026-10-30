const fs = require('fs');
const path = require('path');
const http = require('http');

// Rutas a los Excels del usuario
const excels = [
  {
    name: 'CNO_2026_Actualizado.xlsx',
    path: path.join('c:', 'Users', 'munoz', 'OneDrive', 'Escritorio', 'Clasificacion', 'CNO_2026_Actualizado.xlsx'),
    endpoint: '/cno/upload'
  },
  {
    name: 'Perfiles_Ocupacionales_CUOC_2025.xlsx',
    path: path.join('c:', 'Users', 'munoz', 'OneDrive', 'Escritorio', 'Clasificacion', 'clasificacion', 'Perfiles_Ocupacionales_CUOC_2025.xlsx'),
    endpoint: '/cuoc/upload'
  }
];

function uploadFile(excel) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(excel.path)) {
      console.error(`\n❌ Error: No se encontró el archivo en: ${excel.path}`);
      return resolve();
    }

    console.log(`\n========================================`);
    console.log(`Subiendo ${excel.name} a ${excel.endpoint}...`);
    console.log(`========================================`);

    const fileBuffer = fs.readFileSync(excel.path);
    const boundary = '----FormBoundary' + Date.now();
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${excel.name}"\r\n` +
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: excel.endpoint,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      timeout: 300000, // 5 minutos máximo
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log(`Respuesta del servidor (Status: ${res.statusCode})`);
        try {
          const json = JSON.parse(data);
          console.log(JSON.stringify(json, null, 2));
        } catch {
          console.log(data.substring(0, 500));
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(`❌ Error al subir: ${e.message}`);
      resolve();
    });

    req.on('timeout', () => {
      console.error('❌ Tiempo de espera agotado (Timeout)');
      req.destroy();
      resolve();
    });

    req.write(body);
    req.end();
  });
}

async function run() {
  for (const excel of excels) {
    await uploadFile(excel);
  }
  console.log('\nProceso de carga masiva finalizado.');
}

run();
