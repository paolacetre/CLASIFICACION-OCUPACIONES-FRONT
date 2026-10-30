const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/8cuoc_reg_destrezas.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const destrezasMap = new Map();
const rows = [];

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 4) {
    const idVal = parseInt(parts[0].trim(), 10);
    const codOcupacion = parts[1].trim();
    const codDestreza = parseInt(parts[2].trim(), 10);
    const nombDestreza = parts[3].trim();

    if (!isNaN(idVal) && codOcupacion !== '' && nombDestreza !== '') {
      if (!isNaN(codDestreza)) {
        destrezasMap.set(codDestreza, nombDestreza);
      }
      rows.push({ idVal, codOcupacion, codDestreza, nombDestreza });
    }
  }
}

const sqlStatements = ['BEGIN;'];

for (const [cod, nomb] of destrezasMap.entries()) {
  sqlStatements.push(
    `INSERT INTO clasificacion.habilidad_destreza (cod_hab_dest, nomb_hab_dest) VALUES (${cod}, '${nomb.replace(/'/g, "''")}') ON CONFLICT (cod_hab_dest) DO UPDATE SET nomb_hab_dest = EXCLUDED.nomb_hab_dest;`
  );
}

sqlStatements.push('TRUNCATE TABLE clasificacion.cuoc_destreza RESTART IDENTITY CASCADE;');

for (const row of rows) {
  const codDest = isNaN(row.codDestreza) ? 'NULL' : row.codDestreza;
  sqlStatements.push(
    `INSERT INTO clasificacion.cuoc_destreza (cod_destrezas_cuoc, cod_ocupacion_cuoc, codigo_destreza, nomb_hab_dest) VALUES (${row.idVal}, '${row.codOcupacion.replace(/'/g, "''")}', ${codDest}, '${row.nombDestreza.replace(/'/g, "''")}');`
  );
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
  console.log(`✅ ${rows.length} Destrezas CUOC procesadas e importadas exitosamente con tabla padre habilidad_destreza.`);
}
