const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/9cuoc_funciones.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const sqlStatements = ['BEGIN;', 'TRUNCATE TABLE clasificacion.cuoc_funciones RESTART IDENTITY;'];
let count = 0;

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 6) {
    const idVal = parseInt(parts[0].trim(), 10);
    const consec = parts[1].trim();
    const nomFuncion = parts[2].trim();
    const codOcupacion = parts[3].trim();
    const estadoVal = parseInt(parts[5].trim(), 10) || 1;

    if (!isNaN(idVal) && nomFuncion !== '' && codOcupacion !== '') {
      sqlStatements.push(
        `INSERT INTO clasificacion.cuoc_funciones (codigo, cod_funcion_cuoc, nom_funcion_cuoc, cod_ocupacion_cuoc, estado) VALUES (${idVal}, '${consec.replace(/'/g, "''")}', '${nomFuncion.replace(/'/g, "''")}', '${codOcupacion.replace(/'/g, "''")}', ${estadoVal});`
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
  console.log(`✅ ${count} Funciones CUOC procesadas e importadas exitosamente en batch.`);
}
