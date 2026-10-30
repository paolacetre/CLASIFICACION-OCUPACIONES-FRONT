const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/6cuoc_grupo_primario.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const sqlStatements = ['BEGIN;'];
let count = 0;
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 3) {
    const codGrupoPrim = parts[0].trim();
    const nomGrupoPrim = parts[1].trim();
    const codSubC = parts[2].trim();
    if (codGrupoPrim !== '' && nomGrupoPrim !== '') {
      sqlStatements.push(
        `INSERT INTO clasificacion.cuoc_grupo_primario (cod_grupo_prim, nom_grupo_prim, cod_subgrupo_c) VALUES ('${codGrupoPrim.replace(/'/g, "''")}', '${nomGrupoPrim.replace(/'/g, "''")}', '${codSubC.replace(/'/g, "''")}') ON CONFLICT (cod_grupo_prim) DO UPDATE SET nom_grupo_prim = EXCLUDED.nom_grupo_prim, cod_subgrupo_c = EXCLUDED.cod_subgrupo_c;`
      );
      count++;
    }
  }
}
sqlStatements.push('COMMIT;');

spawnSync('docker', ['exec', '-i', 'clasificacion_bd', 'psql', '-U', 'postgres', '-d', 'clasificacion'], {
  input: sqlStatements.join('\n'),
  encoding: 'utf8',
});
console.log(`✅ ${count} Grupos Primarios CUOC procesados exitosamente.`);
