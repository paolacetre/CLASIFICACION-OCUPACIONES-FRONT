const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/12cuoc_denominaciones.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const sqlStatements = ['BEGIN;', 'TRUNCATE TABLE clasificacion.cuoc_denominacion RESTART IDENTITY CASCADE;'];
let count = 0;

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 4) {
    const idVal = parseInt(parts[0].trim(), 10);
    const codDenom = parts[1].trim();
    const nomDenom = parts[2].trim();
    const codOcup = parts[3].trim();
    const fuente = parts[4] ? parts[4].trim() : '';
    const obs = parts[5] ? parts[5].trim() : '';
    const estadoVal = parts[7] ? parseInt(parts[7].trim(), 10) : 1;

    if (!isNaN(idVal) && nomDenom !== '' && codOcup !== '') {
      sqlStatements.push(
        `INSERT INTO clasificacion.cuoc_denominacion (codigo, cod_denominacion, nom_denominacion, cod_ocupacion_cuoc, fuente_denom, observacion, estado) VALUES (${idVal}, '${codDenom.replace(/'/g, "''")}', '${nomDenom.replace(/'/g, "''")}', '${codOcup.replace(/'/g, "''")}', '${fuente.replace(/'/g, "''")}', '${obs.replace(/'/g, "''")}', ${isNaN(estadoVal) ? 1 : estadoVal});`
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
  maxBuffer: 100 * 1024 * 1024,
});

if (res.error) {
  console.error('Error:', res.error);
} else {
  console.log(`✅ ${count} Denominaciones CUOC procesadas e importadas exitosamente en batch.`);
}
