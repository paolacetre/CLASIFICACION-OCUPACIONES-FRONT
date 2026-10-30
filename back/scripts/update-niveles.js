const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const csvPath = __dirname + '/../../CUOCDB/2cuoc_niveles_competencia.csv';
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(';');
  if (parts.length >= 2) {
    const cod = parseInt(parts[0].trim(), 10);
    const desc = parts.slice(1).join(';').trim();
    if (!isNaN(cod) && desc) {
      const sql = `INSERT INTO clasificacion.cuoc_nivel_competencia (cod_nivel, nombre_nivel) VALUES (${cod}, '${desc.replace(/'/g, "''")}') ON CONFLICT (cod_nivel) DO UPDATE SET nombre_nivel = EXCLUDED.nombre_nivel;`;
      console.log(`Actualizando nivel ${cod}...`);
      execSync(`docker exec -i clasificacion_bd psql -U postgres -d clasificacion -c "${sql.replace(/"/g, '\\"')}"`);
    }
  }
}

console.log('✅ Niveles de competencia actualizados correctamente.');
