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

async function deleteEmptyDenominations() {
  try {
    console.log(`Conectando a base de datos en ${config.host}:${config.port}...`);
    await client.connect();
    console.log('✅ Conexión establecida.');

    // 1. Identificar las denominaciones vacías de CNO
    const queryEmptyDenoms = `
      SELECT cod_denominacion_cno 
      FROM clasificacion.cno_denominacion 
      WHERE desc_denominacion = '' 
         OR desc_denominacion IS NULL 
         OR LOWER(desc_denominacion) = 'sin nombre'
    `;
    const emptyDenomsRes = await client.query(queryEmptyDenoms);
    const emptyDenoms = emptyDenomsRes.rows.map(row => row.cod_denominacion_cno);
    console.log(`🔍 Se encontraron ${emptyDenoms.length} denominaciones en cno_denominacion que visualmente aparecen como "Sin nombre".`);

    if (emptyDenoms.length === 0) {
      console.log('ℹ️ No hay registros con denominaciones vacías para eliminar.');
      return;
    }

    // Iniciar transacción
    await client.query('BEGIN');

    // 2. Eliminar referencias en correlativa
    console.log('🗑️ Eliminando referencias asociadas en clasificacion.correlativa_denominacion...');
    const deleteCorrelativaQuery = `
      DELETE FROM clasificacion.correlativa_denominacion 
      WHERE cod_denominacion_cno IN (
        SELECT cod_denominacion_cno 
        FROM clasificacion.cno_denominacion 
        WHERE desc_denominacion = '' 
           OR desc_denominacion IS NULL 
           OR LOWER(desc_denominacion) = 'sin nombre'
      )
    `;
    const deleteCorrelativaRes = await client.query(deleteCorrelativaQuery);
    console.log(`✅ Se eliminaron ${deleteCorrelativaRes.rowCount} relaciones de 'correlativa_denominacion'.`);

    // 3. Eliminar de cno_denominacion
    console.log('🗑️ Eliminando denominaciones sin nombre de clasificacion.cno_denominacion...');
    const deleteCnoDenomQuery = `
      DELETE FROM clasificacion.cno_denominacion 
      WHERE desc_denominacion = '' 
         OR desc_denominacion IS NULL 
         OR LOWER(desc_denominacion) = 'sin nombre'
    `;
    const deleteCnoDenomRes = await client.query(deleteCnoDenomQuery);
    console.log(`✅ Se eliminaron ${deleteCnoDenomRes.rowCount} denominaciones de 'cno_denominacion'.`);

    // Confirmar transacción
    await client.query('COMMIT');
    console.log('🎉 Transacción confirmada. Eliminación completada con éxito.');

  } catch (error) {
    console.log('❌ Error durante la eliminación. Realizando rollback...');
    await client.query('ROLLBACK');
    console.error(error);
  } finally {
    await client.end();
  }
}

deleteEmptyDenominations();
