/**
 * Carga la hoja "FUNCIONES" de APE_CNO.xlsx (raíz del repo) hacia las tablas
 * reales del catálogo CNO: cno_funcion (catálogo maestro) y cno_reg_funciones
 * (vínculo ocupación-función). Ambas estaban vacías (0 filas) aunque la
 * ocupación y la denominación sí se habían cargado — esta es la pieza que
 * faltaba para que /api/cno/funciones/* y las pantallas de consulta CNO/CUOC
 * muestren funciones reales en vez de un catálogo vacío.
 *
 * Sigue la MISMA convención de códigos que usa el resto de la app
 * (CnoFuncionesService.generarCodigoCatalogo / generarCodigoRelacion):
 *   - Catálogo: F-001, F-002, ... (uno por descripción única)
 *   - Relación: F-{codOcupacion}.001, F-{codOcupacion}.002, ... (uno por fila,
 *     consecutivo dentro de cada ocupación)
 *
 * Filas que no traen "Identificador Ocupación", no traen "Descripción", o
 * referencian una ocupación que no existe en cno_ocupacion se omiten y se
 * cuentan al final (no se inventan datos que el Excel no trae).
 */
const path = require('path');
const { spawnSync } = require('child_process');
const XLSX = require('../node_modules/xlsx');

const EXCEL_PATH = path.join(__dirname, '..', '..', 'APE_CNO.xlsx');
const SHEET_NAME = 'FUNCIONES';

function esc(value) {
  return String(value).replace(/'/g, "''");
}

function main() {
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    console.error(`No se encontró la hoja "${SHEET_NAME}" en ${EXCEL_PATH}`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  // Ocupaciones válidas: se leen de la BD para no crear relaciones huérfanas.
  const codigosOcupacionRes = spawnSync(
    'docker',
    ['exec', 'clasificacion_bd', 'psql', '-U', 'postgres', '-d', 'clasificacion', '-t', '-c',
      'SELECT cod_ocupacion_cno FROM clasificacion.cno_ocupacion;'],
    { encoding: 'utf8' },
  );
  if (codigosOcupacionRes.error || codigosOcupacionRes.status !== 0) {
    console.error('No se pudo leer cno_ocupacion:', codigosOcupacionRes.error || codigosOcupacionRes.stderr);
    process.exit(1);
  }
  const ocupacionesValidas = new Set(
    codigosOcupacionRes.stdout.split('\n').map((l) => l.trim()).filter(Boolean),
  );
  console.log(`Ocupaciones existentes en BD: ${ocupacionesValidas.size}`);

  let sinOcupacion = 0;
  let sinDescripcion = 0;
  let ocupacionNoExiste = 0;
  let descripcionEsCodigoOcupacion = 0;
  const ocupacionesNoEncontradas = new Set();

  // 1a pasada: descripciones únicas -> código de catálogo F-NNN.
  const codigoPorDescripcion = new Map();
  const descripcionOriginalPorCodigo = new Map();
  let siguienteCodigoCatalogo = 1;
  // 1a pasada también arma, por ocupación, el consecutivo de relación.
  const consecutivoPorOcupacion = new Map();

  const filasValidas = [];

  for (const row of rows) {
    const codOcupacion = row['Identificador Ocupación'] == null ? '' : String(row['Identificador Ocupación']).trim();
    const descripcion = row['Descripción'] == null ? '' : String(row['Descripción']).trim();

    if (!codOcupacion) { sinOcupacion++; continue; }
    if (!descripcion) { sinDescripcion++; continue; }
    // Calidad de datos del propio Excel: 18 filas traen el código de la
    // ocupación pegado en la columna Descripción en vez de un texto real
    // (ej. fila Identificador 1040: Descripción="2273", Identificador
    // Ocupación="2273"). No es un error de este script — se descartan para
    // no escribir basura en cno_reg_funciones.
    if (descripcion === codOcupacion) { descripcionEsCodigoOcupacion++; continue; }
    if (!ocupacionesValidas.has(codOcupacion)) {
      ocupacionNoExiste++;
      ocupacionesNoEncontradas.add(codOcupacion);
      continue;
    }

    const claveDesc = descripcion.toLowerCase();
    let codFuncion = codigoPorDescripcion.get(claveDesc);
    if (!codFuncion) {
      codFuncion = `F-${String(siguienteCodigoCatalogo).padStart(3, '0')}`;
      codigoPorDescripcion.set(claveDesc, codFuncion);
      descripcionOriginalPorCodigo.set(codFuncion, descripcion);
      siguienteCodigoCatalogo++;
    }

    const consecutivo = (consecutivoPorOcupacion.get(codOcupacion) || 0) + 1;
    consecutivoPorOcupacion.set(codOcupacion, consecutivo);
    const codigoRelacion = `F-${codOcupacion}.${String(consecutivo).padStart(3, '0')}`;

    filasValidas.push({ codigoRelacion, codOcupacion, codFuncion, descripcion });
  }

  console.log({
    totalFilasExcel: rows.length,
    sinOcupacion,
    sinDescripcion,
    descripcionEsCodigoOcupacion,
    ocupacionNoExiste,
    ocupacionesNoEncontradas: [...ocupacionesNoEncontradas],
    filasAImportar: filasValidas.length,
    funcionesCatalogoUnicas: codigoPorDescripcion.size,
  });

  // Sin TRUNCATE: ambas tablas ya están vacías (verificado antes de escribir este
  // script), así que el import es puramente aditivo. Si se necesita re-ejecutar
  // sobre datos existentes, hay que vaciar las tablas a mano primero.
  const sql = ['BEGIN;'];

  for (const [codFuncion, original] of descripcionOriginalPorCodigo) {
    sql.push(
      `INSERT INTO clasificacion.cno_funcion (cod_funcion, desc_funcion_cno) VALUES ('${esc(codFuncion)}', '${esc(original)}');`,
    );
  }

  for (const fila of filasValidas) {
    sql.push(
      `INSERT INTO clasificacion.cno_reg_funciones (codigo, desc_funcion_cno, estado, cno_ocupacion, cod_funcion) ` +
      `VALUES ('${esc(fila.codigoRelacion)}', '${esc(fila.descripcion)}', 1, '${esc(fila.codOcupacion)}', '${esc(fila.codFuncion)}');`,
    );
  }

  sql.push('COMMIT;');

  const res = spawnSync(
    'docker',
    ['exec', '-i', 'clasificacion_bd', 'psql', '-U', 'postgres', '-d', 'clasificacion'],
    { input: sql.join('\n'), encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 },
  );

  if (res.error) {
    console.error('Error ejecutando psql:', res.error);
    process.exit(1);
  }
  console.log(res.stdout);
  if (res.stderr) console.error(res.stderr);
  if (res.status !== 0) {
    console.error(`psql terminó con código ${res.status}`);
    process.exit(res.status);
  }
  console.log(`✅ Importadas ${codigoPorDescripcion.size} funciones de catálogo y ${filasValidas.length} relaciones ocupación-función.`);
}

main();
