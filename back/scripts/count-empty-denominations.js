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

async function countEmptyDenoms() {
  try {
    await client.connect();
    console.log('Conectado a la base de datos.');

    // Contar en cno_denominacion con desc_denominacion vacío, nulo, o 'sin nombre'
    const resCno = await client.query(`
      SELECT 
        SUM(CASE WHEN desc_denominacion IS NULL THEN 1 ELSE 0 END) as count_null,
        SUM(CASE WHEN desc_denominacion = '' THEN 1 ELSE 0 END) as count_empty,
        SUM(CASE WHEN LOWER(desc_denominacion) = 'sin nombre' THEN 1 ELSE 0 END) as count_text,
        COUNT(*) as total
      FROM clasificacion.cno_denominacion;
    `);

    console.log('Resultados cno_denominacion:');
    console.log(resCno.rows[0]);

    // Contar en correlativa con desc_denominacion_cno vacío, nulo, o 'sin nombre'
    const resCorrelativa = await client.query(`
      SELECT 
        SUM(CASE WHEN desc_denominacion_cno IS NULL THEN 1 ELSE 0 END) as count_null,
        SUM(CASE WHEN desc_denominacion_cno = '' THEN 1 ELSE 0 END) as count_empty,
        SUM(CASE WHEN LOWER(desc_denominacion_cno) = 'sin nombre' THEN 1 ELSE 0 END) as count_text,
        COUNT(*) as total
      FROM clasificacion.correlativa_denominacion;
    `);

    console.log('Resultados correlativa:');
    console.log(resCorrelativa.rows[0]);

  } catch (error) {
    console.error(error);
  } finally {
    await client.end();
  }
}

countEmptyDenoms();
