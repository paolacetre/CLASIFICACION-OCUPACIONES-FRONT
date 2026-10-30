const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/5cuoc_subgrupo.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const sqlStatements = ['BEGIN;'];
let count = 0;
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 3) {
    const codSubC = parts[0].trim();
    const nomSubC = parts[1].trim();
    const codSubP = parts[2].trim();
    if (codSubC !== '' && nomSubC !== '') {
      sqlStatements.push(
        `INSERT INTO clasificacion.cuoc_subgrupo (cod_subgrupo_c, nom_subgrupo_c, cod_subgrupo_p) VALUES ('${codSubC.replace(/'/g, "''")}', '${nomSubC.replace(/'/g, "''")}', '${codSubP.replace(/'/g, "''")}') ON CONFLICT (cod_subgrupo_c) DO UPDATE SET nom_subgrupo_c = EXCLUDED.nom_subgrupo_c, cod_subgrupo_p = EXCLUDED.cod_subgrupo_p;`
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
console.log(`✅ ${count} Subgrupos CUOC procesados exitosamente.`);
