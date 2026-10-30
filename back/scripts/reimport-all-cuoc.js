const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando re-importación completa de la base de datos CUOC...');

const scripts = [
  'import-cuocdb-csvs.js',
  'import-gran-grupo.js',
  'import-subgrupo-principal.js',
  'import-subgrupo.js',
  'import-grupo-primario.js',
  'import-ocupaciones.js',
  'import-destrezas.js',
  'import-funciones.js',
  'import-conocimientos.js',
  'import-reg-conocimientos.js',
  'import-denominaciones.js',
  'import-ocup-afin.js',
];

const scriptsDir = __dirname;

for (const script of scripts) {
  const scriptPath = path.join(scriptsDir, script);
  console.log(`\n▶ Ejecutando ${script}...`);
  try {
    const out = execSync(`node "${scriptPath}"`, { encoding: 'utf8' });
    console.log(out.trim());
  } catch (err) {
    console.error(`❌ Error al ejecutar ${script}: ${err.message}`);
  }
}

console.log('\n🎉 ¡Re-importación completa finalizada exitosamente!');
