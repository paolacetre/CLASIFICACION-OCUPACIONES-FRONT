const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/4cuoc_subgrupo_principal.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const sqlStatements = ['BEGIN;'];
let count = 0;
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 3) {
    const codSub = parts[0].trim();
    const nomSub = parts[1].trim();
    const codGran = parts[2].trim();
    if (codSub !== '' && nomSub !== '') {
      sqlStatements.push(
        `INSERT INTO clasificacion.cuoc_subgrupo_principal (cod_subgrupo_p, nom_subgrupo_p, cod_gran_grupo) VALUES ('${codSub.replace(/'/g, "''")}', '${nomSub.replace(/'/g, "''")}', '${codGran.replace(/'/g, "''")}') ON CONFLICT (cod_subgrupo_p) DO UPDATE SET nom_subgrupo_p = EXCLUDED.nom_subgrupo_p, cod_gran_grupo = EXCLUDED.cod_gran_grupo;`
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
console.log(`✅ ${count} Subgrupos Principales CUOC procesados exitosamente.`);
