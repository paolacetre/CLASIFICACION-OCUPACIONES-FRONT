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

// 2. Definir ruta al archivo CSV
const csvPathsToTry = [
  path.join(__dirname, '..', '..', 'correlativa.csv'),
  'c:\\Users\\DERO\\Documents\\Proyecto cuoc\\clasificacion\\correlativa.csv'
];

let csvPath = '';
for (const p of csvPathsToTry) {
  if (fs.existsSync(p)) {
    csvPath = p;
    break;
  }
}

if (!csvPath) {
  console.error('❌ Error: No se encontró el archivo correlativa.csv en las rutas configuradas.');
  process.exit(1);
}

console.log(`Leyendo datos desde: ${csvPath}`);

// 3. Procesar el archivo CSV y preparar registros
const fileContent = fs.readFileSync(csvPath, 'utf8');
const lines = fileContent.split(/\r?\n/);

const records = [];
let skippedLines = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const cols = line.split(';');
  if (cols.length < 8) {
    skippedLines++;
    continue;
  }

  // Mapear campos eliminando el "id" de la columna 0
  const codOcupacionCno = cols[1]?.trim() || '';
  const codDenominacionCno = cols[2]?.trim() || '';
  const descDenominacionCno = cols[3]?.trim() || null;
  const codDenominacionCuoc = cols[4]?.trim() || '';
  const descDenominacionCuoc = cols[5]?.trim() || null;
  const codOcupacionCuoc = cols[6]?.trim() || '';
  const estado = cols[7]?.trim().toLowerCase() === 'true';

  if (!codDenominacionCno || !codDenominacionCuoc) {
    skippedLines++;
    continue;
  }

  records.push([
    codOcupacionCno,
    codDenominacionCno,
    descDenominacionCno,
    codDenominacionCuoc,
    descDenominacionCuoc,
    codOcupacionCuoc,
    estado
  ]);
}

console.log(`Leídos con éxito ${records.length} registros válidos del CSV (omitidos/erróneos: ${skippedLines}).`);

const client = new Client(config);

async function injectCorrelativa() {
  try {
    console.log(`Conectando a base de datos en ${config.host}:${config.port}...`);
    await client.connect();
    console.log('✅ Conexión establecida.');

    // Iniciar transacción
    await client.query('BEGIN');

    // Desactivar temporalmente FKs y Triggers para evitar errores si no están sembrados los catálogos padres
    console.log('⚙️ Desactivando validación de claves foráneas...');
    await client.query("SET session_replication_role = 'replica'");

    // Vaciar tabla correlativa_denominacion
    console.log('🗑️ Vaciando tabla clasificacion.correlativa_denominacion...');
    await client.query('TRUNCATE TABLE clasificacion.correlativa_denominacion RESTART IDENTITY CASCADE');

    // Insertar registros en lotes
    const batchSize = 300;
    let totalInserted = 0;
    console.log(`💾 Guardando en lotes de ${batchSize}...`);

    for (let i = 0; i < records.length; i += batchSize) {
      const chunk = records.slice(i, i + batchSize);
      
      const columns = [
        'cod_ocupacion_cno',
        'cod_denominacion_cno',
        'desc_denominacion_cno',
        'cod_denominacion_cuoc',
        'desc_denominacion_cuoc',
        'cod_ocupacion_cuoc',
        'estado'
      ];

      const placeholders = chunk
        .map((_, rIdx) => {
          const rowPlaceholders = columns.map((_, cIdx) => {
            return `$${rIdx * columns.length + cIdx + 1}`;
          });
          return `(${rowPlaceholders.join(', ')})`;
        })
        .join(', ');

      const query = `INSERT INTO clasificacion.correlativa_denominacion (${columns.join(', ')}) VALUES ${placeholders}`;
      const params = chunk.flat();

      await client.query(query, params);
      totalInserted += chunk.length;
    }

    // Restaurar comportamiento de FKs y Triggers
    console.log('⚙️ Reactivando validación de claves foráneas...');
    await client.query("SET session_replication_role = 'origin'");

    // Confirmar transacción
    await client.query('COMMIT');
    console.log(`🎉 ¡Éxito! Inyección directa completada. Se insertaron ${totalInserted} registros en clasificacion.correlativa_denominacion.`);

  } catch (error) {
    console.log('❌ Error durante la inyección. Realizando rollback...');
    await client.query('ROLLBACK');
    console.error(error);
  } finally {
    await client.end();
  }
}

injectCorrelativa();
