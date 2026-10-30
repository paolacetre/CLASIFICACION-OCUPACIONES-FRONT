const XLSX = require('xlsx');
const path = require('path');
const { spawnSync } = require('child_process');

const excelPath = __dirname + '/../../CUOCDB/correlativa.xlsx';
console.log('📖 Leyendo archivo:', excelPath);

const wb = XLSX.readFile(excelPath);
const sheetName = wb.SheetNames.includes('Hoja1 (2)') ? 'Hoja1 (2)' : wb.SheetNames[0];
console.log(`Usando pestaña: ${sheetName}`);

const ws = wb.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
console.log(`Total filas leídas: ${rows.length}`);

const sqlStatements = [
  'BEGIN;',
  "SET session_replication_role = 'replica';",
  'TRUNCATE TABLE clasificacion.correlativa_denominacion RESTART IDENTITY CASCADE;'
];

const cnoOcupaciones = new Map();
const cnoDenominaciones = new Map();

let insertedCount = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!Array.isArray(row) || row.length < 7) continue;

  const cnoOcupCode = row[1] != null ? String(row[1]).trim() : '';
  const cnoDenomCode = row[2] != null ? String(row[2]).trim() : '';
  const cnoDenomName = row[3] != null ? String(row[3]).trim() : '';

  const cuocOcupCode = row[4] != null ? String(row[4]).trim() : '';
  const cuocDenomCode = row[5] != null ? String(row[5]).trim() : '';
  const cuocDenomName = row[6] != null ? String(row[6]).trim() : '';

  if (cnoDenomCode && cuocDenomCode) {
    const escCnoOcup = cnoOcupCode.replace(/'/g, "''");
    const escCnoDenom = cnoDenomCode.replace(/'/g, "''");
    const escCnoName = cnoDenomName.replace(/'/g, "''");

    const escCuocOcup = cuocOcupCode.replace(/'/g, "''");
    const escCuocDenom = cuocDenomCode.replace(/'/g, "''");
    const escCuocName = cuocDenomName.replace(/'/g, "''");

    if (cnoOcupCode && !cnoOcupaciones.has(cnoOcupCode)) {
      cnoOcupaciones.set(cnoOcupCode, true);
      sqlStatements.push(
        `INSERT INTO clasificacion.cno_ocupacion (cod_ocupacion_cno, nomb_ocupacion_cno, descripcion, cod_desempeno_cno, nom_desempeno, cod_cualificacion_cno, niveles_cualificacion, estado) VALUES ('${escCnoOcup}', '${escCnoName || escCnoOcup}', '${escCnoName || escCnoOcup}', '1', 'General', '1', 'Nivel 1', true) ON CONFLICT (cod_ocupacion_cno) DO NOTHING;`
      );
    }

    if (cnoDenomCode && !cnoDenominaciones.has(cnoDenomCode)) {
      cnoDenominaciones.set(cnoDenomCode, true);
      sqlStatements.push(
        `INSERT INTO clasificacion.cno_denominacion (cod_denominacion_cno, desc_denominacion, cno_cod_ocupacion, estado) VALUES ('${escCnoDenom}', '${escCnoName}', '${escCnoOcup}', 1) ON CONFLICT (cod_denominacion_cno) DO NOTHING;`
      );
    }

    sqlStatements.push(
      `INSERT INTO clasificacion.correlativa_denominacion (cod_ocupacion_cno, cod_denominacion_cno, desc_denominacion_cno, cod_ocupacion_cuoc, cod_denominacion_cuoc, desc_denominacion_cuoc, estado) VALUES ('${escCnoOcup}', '${escCnoDenom}', '${escCnoName}', '${escCuocOcup}', '${escCuocDenom}', '${escCuocName}', true);`
    );

    insertedCount++;
  }
}

sqlStatements.push("SET session_replication_role = 'origin';");
sqlStatements.push('COMMIT;');

console.log(`Enviando ${insertedCount} relaciones correlativas CNO <-> CUOC a PostgreSQL...`);

const fullSql = sqlStatements.join('\n');
const res = spawnSync('docker', ['exec', '-i', 'clasificacion_bd', 'psql', '-U', 'postgres', '-d', 'clasificacion'], {
  input: fullSql,
  encoding: 'utf8',
  maxBuffer: 100 * 1024 * 1024,
});

if (res.error) {
  console.error('❌ Error:', res.error);
} else {
  console.log(`✅ ${insertedCount} Relaciones Correlativas CNO <-> CUOC cargadas exitosamente en la base de datos!`);
}
