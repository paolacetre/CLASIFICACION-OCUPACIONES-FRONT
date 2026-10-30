const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/7cuoc_ocupaciones.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const sqlStatements = ['BEGIN;'];
let count = 0;

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 11) {
    const codOcupacion = parts[1].trim();
    const nomOcupacion = parts[2].trim();
    const descOcupacion = parts[3].trim();
    const codNivel = parseInt(parts[4].trim(), 10) || 1;
    const nombreVal = parts[5].trim();
    const codArea = parts[6].trim();
    const codGrupoPrim = parts[8].trim();
    const fechaRegRaw = parts[9].trim();
    const estado = parts[10].trim().toLowerCase() === 'true';

    let fechaRegVal = 'NULL';
    if (fechaRegRaw && fechaRegRaw !== '') {
      const dParts = fechaRegRaw.split('/');
      if (dParts.length === 3) {
        const day = dParts[0].padStart(2, '0');
        const month = dParts[1].padStart(2, '0');
        const year = dParts[2];
        fechaRegVal = `'${year}-${month}-${day}'`;
      }
    }

    if (codOcupacion !== '' && nomOcupacion !== '') {
      sqlStatements.push(
        `INSERT INTO clasificacion.cuoc_ocupacion (cod_ocupacion_cuoc, nom_ocupacion_cuoc, desc_ocupacion_cuoc, cod_nivel_cuoc, nombre, codigo_area_cuoc, cod_grupo_prim, estado, fecha_registro) VALUES ('${codOcupacion.replace(/'/g, "''")}', '${nomOcupacion.replace(/'/g, "''")}', '${descOcupacion.replace(/'/g, "''")}', ${codNivel}, '${nombreVal.replace(/'/g, "''")}', '${codArea.replace(/'/g, "''")}', '${codGrupoPrim.replace(/'/g, "''")}', ${estado}, ${fechaRegVal}) ON CONFLICT (cod_ocupacion_cuoc) DO UPDATE SET nom_ocupacion_cuoc = EXCLUDED.nom_ocupacion_cuoc, desc_ocupacion_cuoc = EXCLUDED.desc_ocupacion_cuoc, cod_nivel_cuoc = EXCLUDED.cod_nivel_cuoc, nombre = EXCLUDED.nombre, codigo_area_cuoc = EXCLUDED.codigo_area_cuoc, cod_grupo_prim = EXCLUDED.cod_grupo_prim, estado = EXCLUDED.estado, fecha_registro = EXCLUDED.fecha_registro;`
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
  console.log(`✅ ${count} Ocupaciones CUOC procesadas e importadas exitosamente en batch.`);
}
