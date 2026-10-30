const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const csvDir = __dirname + '/../../CUOCDB';
const areaCsv = path.join(csvDir, '1cuoc_area_cualificacion.csv');
const nivelCsv = path.join(csvDir, '2cuoc_niveles_competencia.csv');

const sqlStatements = ['BEGIN;'];

if (fs.existsSync(areaCsv)) {
  const content = fs.readFileSync(areaCsv, 'utf8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length >= 3) {
      const sigla = parts[1].trim();
      const descripcion = parts[2].trim();
      if (sigla && descripcion) {
        sqlStatements.push(
          `INSERT INTO clasificacion.cuoc_area_cualificacion (codigo, descripcion) VALUES ('${sigla.replace(/'/g, "''")}', '${descripcion.replace(/'/g, "''")}') ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion;`
        );
      }
    }
  }
}

if (fs.existsSync(nivelCsv)) {
  const content = fs.readFileSync(nivelCsv, 'utf8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    if (parts.length >= 2) {
      const cod = parseInt(parts[0].trim(), 10);
      const desc = `Nivel ${cod}`;
      if (!isNaN(cod)) {
        sqlStatements.push(
          `INSERT INTO clasificacion.cuoc_nivel_competencia (cod_nivel, nombre_nivel) VALUES (${cod}, '${desc}') ON CONFLICT (cod_nivel) DO UPDATE SET nombre_nivel = EXCLUDED.nombre_nivel;`
        );
      }
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
  console.log(`✅ Áreas de Cualificación y Niveles procesados exitosamente.`);
}
