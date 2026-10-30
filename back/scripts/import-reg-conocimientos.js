const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/11cuoc_reg_conocimientos.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const sqlStatements = ['BEGIN;', 'TRUNCATE TABLE clasificacion.cuoc_reg_conocimientos RESTART IDENTITY;'];
let count = 0;

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 4) {
    const idVal = parseInt(parts[0].trim(), 10);
    const codOcup = parts[1].trim();
    const codConoc = parseInt(parts[2].trim(), 10);
    const nombConoc = parts[3].trim();

    if (!isNaN(idVal) && codOcup !== '' && nombConoc !== '') {
      sqlStatements.push(
        `INSERT INTO clasificacion.cuoc_reg_conocimientos (codigo, cod_ocupacion_cuoc, cod_conocimiento, nomb_conocimiento) VALUES (${idVal}, '${codOcup.replace(/'/g, "''")}', ${isNaN(codConoc) ? 'NULL' : codConoc}, '${nombConoc.replace(/'/g, "''")}');`
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
  console.log(`✅ ${count} Registros de Conocimientos CUOC procesados e importados exitosamente en batch.`);
}
