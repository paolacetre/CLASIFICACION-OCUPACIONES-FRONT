const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/10cuoc_conocimientos.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const sqlStatements = ['BEGIN;'];
let count = 0;

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 2) {
    const codVal = parseInt(parts[0].trim(), 10);
    const nombConoc = parts[1].trim();
    const descConoc = parts[2] ? parts[2].trim() : '';

    if (!isNaN(codVal) && nombConoc !== '') {
      sqlStatements.push(
        `INSERT INTO clasificacion.cuoc_conocimiento (cod_conocimiento, nomb_conocimiento, desc_conocimiento) VALUES (${codVal}, '${nombConoc.replace(/'/g, "''")}', '${descConoc.replace(/'/g, "''")}') ON CONFLICT (cod_conocimiento) DO UPDATE SET nomb_conocimiento = EXCLUDED.nomb_conocimiento, desc_conocimiento = EXCLUDED.desc_conocimiento;`
      );
      count++;
    }
  }
}
sqlStatements.push('COMMIT;');

const fullSql = sqlStatements.join('\n');
const res = spawnSync('docker', ['exec', '-i', 'clasificacion_bd', 'psql', '-U', 'postgres', '-d', 'clasificacion'], {
  input: fullSql,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});

if (res.error) {
  console.error('Error:', res.error);
} else {
  console.log(`✅ ${count} Conocimientos CUOC procesados e importados exitosamente en batch.`);
}
