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

async function deleteSinNombre() {
  try {
    console.log(`Conectando a base de datos en ${config.host}:${config.port}...`);
    await client.connect();
    console.log('✅ Conexión establecida.');

    // 1. Contar en correlativa
    const countCorrelativaRes = await client.query(
      `SELECT COUNT(*) as count FROM clasificacion.correlativa_denominacion WHERE LOWER(desc_denominacion_cno) = 'sin nombre'`
    );
    const correlativaCount = parseInt(countCorrelativaRes.rows[0].count, 10);
    console.log(`🔍 Registros encontrados en 'clasificacion.correlativa_denominacion' con desc_denominacion_cno = 'Sin nombre': ${correlativaCount}`);

    // 2. Contar en cno_denominacion
    const countCnoDenomRes = await client.query(
      `SELECT COUNT(*) as count FROM clasificacion.cno_denominacion WHERE LOWER(desc_denominacion) = 'sin nombre'`
    );
    const cnoDenomCount = parseInt(countCnoDenomRes.rows[0].count, 10);
    console.log(`🔍 Registros encontrados en 'clasificacion.cno_denominacion' con desc_denominacion = 'Sin nombre': ${cnoDenomCount}`);

    if (correlativaCount === 0 && cnoDenomCount === 0) {
      console.log('ℹ️ No hay registros "Sin nombre" que eliminar.');
      return;
    }

    // Iniciar transacción
    await client.query('BEGIN');

    // 3. Eliminar de clasificacion.correlativa_denominacion primero debido a FKs
    if (correlativaCount > 0) {
      console.log('🗑️ Eliminando de clasificacion.correlativa_denominacion...');
      const deleteCorrelativaRes = await client.query(
        `DELETE FROM clasificacion.correlativa_denominacion WHERE LOWER(desc_denominacion_cno) = 'sin nombre'`
      );
      console.log(`✅ Eliminados ${deleteCorrelativaRes.rowCount} registros de 'correlativa_denominacion'.`);
    }

    // 4. Eliminar de clasificacion.cno_denominacion
    if (cnoDenomCount > 0) {
      console.log('🗑️ Eliminando de clasificacion.cno_denominacion...');
      const deleteCnoDenomRes = await client.query(
        `DELETE FROM clasificacion.cno_denominacion WHERE LOWER(desc_denominacion) = 'sin nombre'`
      );
      console.log(`✅ Eliminados ${deleteCnoDenomRes.rowCount} registros de 'cno_denominacion'.`);
    }

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

deleteSinNombre();
