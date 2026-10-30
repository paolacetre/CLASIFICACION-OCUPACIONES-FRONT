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
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT || '5432', 10),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE || 'postgres',
  ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

console.log('Conectando a PostgreSQL...');
console.log(`Host: ${config.host}`);
console.log(`Database: ${config.database}`);

const client = new Client(config);

async function clearDatabase() {
  try {
    await client.connect();
    console.log('Conexión establecida con éxito.');

    // 1. Obtener todas las tablas en los esquemas 'clasificacion' y 'public'
    const res = await client.query(`
      SELECT schemaname, tablename 
      FROM pg_tables 
      WHERE schemaname IN ('clasificacion', 'public');
    `);

    // Filtrar para ignorar posibles tablas de migración o tablas del sistema si las hubiera
    const excludedTables = ['spatial_ref_sys']; // agregar exclusiones si es necesario
    const tables = res.rows
      .filter(row => !excludedTables.includes(row.tablename))
      .map(row => ({ schema: row.schemaname, table: row.tablename }));

    if (tables.length === 0) {
      console.log('No se encontraron tablas en los esquemas "clasificacion" o "public".');
      return;
    }

    console.log(`Se encontraron ${tables.length} tablas para limpiar:`);
    console.log(tables.map(t => `  - ${t.schema}.${t.table}`).join('\n'));

    // 2. Ejecutar TRUNCATE CASCADE para todas las tablas encontradas
    console.log('\nLimpiando datos...');
    const truncateQuery = `TRUNCATE TABLE ${tables.map(t => `"${t.schema}"."${t.table}"`).join(', ')} CASCADE;`;
    
    await client.query(truncateQuery);
    console.log('¡Todos los datos han sido borrados con éxito!');

  } catch (error) {
    console.error('Error al intentar borrar los datos:', error);
  } finally {
    await client.end();
  }
}

clearDatabase();
