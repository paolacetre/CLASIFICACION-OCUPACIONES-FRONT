const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// 1. Cargar variables de entorno desde .env
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('Error: No se encontró el archivo .env en la raíz del proyecto.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    // Comentario en linea (`VALOR   # nota`) en valores sin comillas: no forma parte del valor.
    if (!value.startsWith('"') && !value.startsWith("'")) value = value.replace(/\s+#.*$/, '').trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const config = {
  host: env.DB_HOST || 'localhost',
  port: parseInt(env.DB_PORT || '5433', 10),
  user: env.DB_USERNAME || 'postgres',
  password: env.DB_PASSWORD || 'rootpassword',
  database: env.DB_DATABASE || 'clasificacion',
  ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

const client = new Client(config);

async function inspect9616() {
  try {
    await client.connect();
    console.log('Conectado a la base de datos.');

    // Inspeccionar la tabla correlativa_denominacion para el código 9616
    const res = await client.query(
      `SELECT * FROM clasificacion.correlativa_denominacion WHERE cod_ocupacion_cno = '9616' LIMIT 10`
    );
    console.log('--- Registros en clasificacion.correlativa_denominacion para 9616: ---');
    console.log(res.rows);

    // Inspeccionar la tabla cno_denominacion
    const resDenom = await client.query(
      `SELECT * FROM clasificacion.cno_denominacion WHERE cno_cod_ocupacion = '9616' LIMIT 10`
    );
    console.log('--- Registros en clasificacion.cno_denominacion para 9616: ---');
    console.log(resDenom.rows);

  } catch (error) {
    console.error(error);
  } finally {
    await client.end();
  }
}

inspect9616();
