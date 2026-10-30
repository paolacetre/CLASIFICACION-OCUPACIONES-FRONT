const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/13cuoc_ocup_afin.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const sqlStatements = ['BEGIN;', 'TRUNCATE TABLE clasificacion.cuoc_ocupacion_afin RESTART IDENTITY;'];
let count = 0;

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 5) {
    const idVal = parseInt(parts[0].trim(), 10);
    const codOcup = parts[1].trim();
    const nomOcup = parts[2].trim();
    const codAfin = parts[3].trim();
    const nomAfin = parts[4].trim();

    if (!isNaN(idVal) && codOcup !== '' && codAfin !== '') {
      sqlStatements.push(
        `INSERT INTO clasificacion.cuoc_ocupacion_afin (codigo, cod_ocupacion_cuoc, nombre_ocupacion, codigo_ocupacion, nombre_cno_afin) VALUES (${idVal}, '${codOcup.replace(/'/g, "''")}', '${nomOcup.replace(/'/g, "''")}', '${codAfin.replace(/'/g, "''")}', '${nomAfin.replace(/'/g, "''")}');`
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
  console.log(`✅ ${count} Ocupaciones Afines CUOC procesadas e importadas exitosamente en batch.`);
}
