/**
 * db-migrate.js — runner de migraciones SQL para la BD `clasificacion`.
 *
 * Por qué existe: el esquema se maneja con SQL a mano (init/01-schema.sql es la
 * fuente de verdad) y `DB_SYNCHRONIZE=false`. Cuando el código añade columnas o
 * tablas, una BD ya creada NO se entera y TypeORM revienta con 500 en cada
 * consulta. Este script aplica los `.sql` de `database/migrations/` que falten,
 * registrándolos en `clasificacion._migrations`, para que el arranque falle
 * ruidosamente ANTES de servir, en vez de a mitad de una request.
 *
 * Uso:
 *   node scripts/db-migrate.js            # aplica pendientes
 *   node scripts/db-migrate.js --check    # solo lista pendientes, sale 1 si hay
 *
 * Se ejecuta solo (npm run db:migrate) y también desde start-dev.ps1.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');
const CHECK_ONLY = process.argv.includes('--check');

const CLAVES_DB = ['DB_HOST', 'DB_PORT', 'DB_PORT_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE', 'DB_SSL'];

// ── Cargar configuración ──
// Dos escenarios distintos y ambos tienen que funcionar:
//   - En local se ejecuta con `npm run db:migrate` y la config vive en el .env raíz.
//   - Dentro del contenedor NO existe .env: docker-compose inyecta las
//     variables en el entorno del proceso. El arranque de la imagen de
//     producción llama a este script, así que exigir el fichero lo rompía.
// Se usa el fichero como base (mismo parser que el resto de scripts) y lo que
// venga en process.env manda por encima.
function loadEnv() {
  const env = {};
  const envPath = path.join(__dirname, '..', '.env');
  const rootEnvPath = path.join(__dirname, '..', '..', '.env');
  const targetPath = fs.existsSync(envPath) ? envPath : (fs.existsSync(rootEnvPath) ? rootEnvPath : null);

  if (targetPath) {
    for (const line of fs.readFileSync(targetPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (!m) continue;
      let v = (m[2] || '').trim();
      // Comentario en linea (`VALOR   # nota`) en valores sin comillas: no forma parte del valor.
      if (!v.startsWith('"') && !v.startsWith("'")) v = v.replace(/\s+#.*$/, '').trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[m[1]] = v;
    }
  }

  for (const clave of CLAVES_DB) {
    if (process.env[clave]) env[clave] = process.env[clave];
  }

  if (!env.DB_PASSWORD) {
    console.error(
      '✖ Falta la configuración de la BD: define DB_PASSWORD en .env ' +
        'o pásala como variable de entorno.',
    );
    process.exit(1);
  }

  return env;
}

const env = loadEnv();
const client = new Client({
  // 'localhost' resuelve primero a ::1 (IPv6) en Windows; Docker Desktop solo
  // publica el puerto en IPv4, así que la conexión falla con ECONNREFUSED
  // aunque el contenedor esté sano (pg_isready funciona porque corre dentro
  // del contenedor, no a través del mapeo de puertos del host).
  host: env.DB_HOST || '127.0.0.1',
  port: parseInt(env.DB_PORT || env.DB_PORT_HOST || '5433', 10),
  user: env.DB_USERNAME || 'postgres',
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE || 'clasificacion',
  ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function ensureRegistry() {
  await client.query('CREATE SCHEMA IF NOT EXISTS clasificacion');
  await client.query(`
    CREATE TABLE IF NOT EXISTS clasificacion._migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedSet() {
  const { rows } = await client.query('SELECT filename FROM clasificacion._migrations');
  return new Set(rows.map((r) => r.filename));
}

function pendingFiles(applied) {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !applied.has(f));
}

async function main() {
  await client.connect();
  try {
    await ensureRegistry();
    const pending = pendingFiles(await appliedSet());

    if (pending.length === 0) {
      console.log('✓ BD al día — sin migraciones pendientes.');
      return;
    }

    if (CHECK_ONLY) {
      console.error(`✖ ${pending.length} migración(es) pendiente(s):`);
      pending.forEach((f) => console.error(`  - ${f}`));
      console.error('\nEjecuta:  npm run db:migrate');
      process.exitCode = 1;
      return;
    }

    console.log(`Aplicando ${pending.length} migración(es)...`);
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`  → ${file} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO clasificacion._migrations (filename) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FALLÓ');
        console.error(`\n✖ ${file}: ${err.message}\n`);
        throw err;
      }
    }
    console.log('✓ Migraciones aplicadas.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    console.error(
      `✖ No se pudo conectar a Postgres en ${client.host}:${client.port}. ` +
        '¿Está levantado el contenedor?  (docker compose up -d db)',
    );
  } else {
    console.error(err.stack || err);
  }
  process.exit(1);
});
