const fs = require('fs');
const { spawnSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/3cuoc_gran_grupo.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

const sqlStatements = ['BEGIN;'];
let count = 0;
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 2) {
    const cod = parts[0].trim();
    const nom = parts[1].trim();
    if (cod !== '' && nom !== '') {
      sqlStatements.push(
        `INSERT INTO clasificacion.cuoc_gran_grupo (cod_gran_grupo, nom_gran_grupo) VALUES ('${cod.replace(/'/g, "''")}', '${nom.replace(/'/g, "''")}') ON CONFLICT (cod_gran_grupo) DO UPDATE SET nom_gran_grupo = EXCLUDED.nom_gran_grupo;`
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
console.log(`✅ ${count} Gran Grupos CUOC procesados exitosamente.`);
