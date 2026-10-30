import * as XLSX from 'xlsx';
import { DeepPartial, EntityManager, EntityTarget } from 'typeorm';
import { ImportErrorDetail } from './cno-import.types';

export interface ExcelRow {
  row: Record<string, unknown>;
  excelRow: number;
}

// Reparacion de encabezados / normalizacion

function repairMojibake(s: string): string {
  // Algunos encabezados del Excel origen quedaron con UTF-8 re-interpretado como Latin-1
  // (la letra "n" con tilde quedo codificada como dos caracteres separados en vez de uno).
  // Se detecta por code point (U+00C3 seguido de un byte de continuacion U+0080-U+00BF)
  // para no depender de literales no ASCII dentro de una regex.
  let hasMojibakePattern = false;
  for (let i = 0; i < s.length - 1; i++) {
    const c1 = s.charCodeAt(i);
    const c2 = s.charCodeAt(i + 1);
    if (c1 === 0xc3 && c2 >= 0x80 && c2 <= 0xbf) {
      hasMojibakePattern = true;
      break;
    }
  }
  if (!hasMojibakePattern) return s;
  try {
    const repaired = Buffer.from(s, 'latin1').toString('utf8');
    if (!repaired.includes(String.fromCharCode(0xfffd))) return repaired;
  } catch {
    // se conserva el original si la reparacion falla
  }
  return s;
}

export function normalizeHeaderKey(s: string): string {
  const withoutMojibake = repairMojibake(String(s));
  const decomposed = withoutMojibake.normalize('NFD');
  let withoutAccents = '';
  for (const ch of decomposed) {
    const code = ch.codePointAt(0) || 0;
    if (code >= 0x0300 && code <= 0x036f) continue; // marcas diacriticas combinantes (forma NFD)
    withoutAccents += ch;
  }
  return withoutAccents.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Localizacion de hojas

/**
 * Nombre real de la hoja que corresponde a alguno de los alias dados (coincidencia
 * exacta, primero literal y luego normalizada). Se expone aparte de `findSheet`
 * porque el cargue necesita saber QUE hojas reconocio para poder avisar de las que
 * quedaron sin procesar: una hoja que nadie mira se ignoraba en silencio, que es
 * justo como "Nivel de conocimiento" estuvo sin cargarse sin que nadie lo notara.
 */
export function findSheetName(workbook: XLSX.WorkBook, candidates: string[]): string | undefined {
  for (const name of candidates) {
    if (workbook.Sheets[name]) return name;
  }
  for (const sheetName of workbook.SheetNames) {
    const sn = normalizeHeaderKey(sheetName);
    for (const c of candidates) {
      if (sn === normalizeHeaderKey(c)) return sheetName;
    }
  }
  return undefined;
}

export function findSheet(workbook: XLSX.WorkBook, candidates: string[]): XLSX.WorkSheet | undefined {
  const name = findSheetName(workbook, candidates);
  return name === undefined ? undefined : workbook.Sheets[name];
}

export function findHeaderRow(ws: XLSX.WorkSheet): number {
  const ref = ws['!ref'];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  const keywords = ['codigo', 'cod'];
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 25); r++) {
    let rowText = '';
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell?.v) rowText += normalizeHeaderKey(String(cell.v)) + ' ';
    }
    if (keywords.some((k) => rowText.includes(k))) return r;
  }
  return range.s.r;
}

/** Lee una hoja fila por fila, devolviendo junto a cada objeto el numero de fila real de Excel (1-based). */
export function sheetToRowsWithIndex(ws: XLSX.WorkSheet | undefined): ExcelRow[] {
  if (!ws || !ws['!ref']) return [];
  const headerRow = findHeaderRow(ws);
  const range = XLSX.utils.decode_range(ws['!ref']);
  const headers: string[] = [];
  const seenHeaderCounts = new Map<string, number>();
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
    let h = cell?.v != null ? String(cell.v).trim() : '';
    if (h) {
      // Encabezados duplicados literalmente (ej. dos columnas "cod_cualificacion_cno" en la
      // hoja Ocupaciones, donde la segunda en realidad contiene el nombre, no el codigo):
      // la primera aparicion conserva el nombre original, las siguientes se sufijan para no
      // pisar el valor correcto al construir el objeto de la fila.
      const count = seenHeaderCounts.get(h) ?? 0;
      seenHeaderCounts.set(h, count + 1);
      if (count > 0) h = h + '_dup' + count;
    }
    headers.push(h);
  }
  const nonEmptyCols = headers.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
  const rows: ExcelRow[] = [];
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const rowObj: Record<string, unknown> = {};
    let hasData = false;
    for (const ci of nonEmptyCols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
      const val = cell?.v;
      if (val != null && val !== '') {
        rowObj[headers[ci]] = val;
        hasData = true;
      }
    }
    if (hasData) rows.push({ row: rowObj, excelRow: r + 1 });
  }
  return rows;
}

// Lectura de columnas por alias exacto (normalizado), sin coincidencia difusa por substring

export function getColumn(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const v = row[alias];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  const normAliases = aliases.map(normalizeHeaderKey);
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined || v === null || v === '') continue;
    if (normAliases.includes(normalizeHeaderKey(k))) return v;
  }
  return undefined;
}

/** Codigo alfanumerico: siempre string recortado, nunca se interpreta como numero (preserva ceros a la izquierda). */
export function getColumnCode(row: Record<string, unknown>, aliases: string[]): string | null {
  const val = getColumn(row, aliases);
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

export function getColumnStr(row: Record<string, unknown>, aliases: string[]): string {
  const val = getColumn(row, aliases);
  return val === undefined || val === null ? '' : String(val).trim();
}

/** Solo para columnas genuinamente numericas (cod_conocimiento, codigo_habilidad, cod_desempe/cualificacion en Ocupaciones). */
export function getColumnInt(row: Record<string, unknown>, aliases: string[]): number | null {
  const val = getColumn(row, aliases);
  if (val === undefined || val === null || val === '') return null;
  const n = parseInt(String(val).trim(), 10);
  return isNaN(n) ? null : n;
}

/**
 * Fecha de una celda como YYYY-MM-DD: número de serie de Excel, Date, texto ISO
 * o dd/mm/aaaa. null si viene vacía o no se reconoce.
 */
export function getColumnFecha(row: Record<string, unknown>, aliases: string[]): string | null {
  const val = getColumn(row, aliases);
  if (val === undefined || val === null || val === '') return null;
  const dos = (n: number) => String(n).padStart(2, '0');
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : `${val.getFullYear()}-${dos(val.getMonth() + 1)}-${dos(val.getDate())}`;
  }
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    return d ? `${d.y}-${dos(d.m)}-${dos(d.d)}` : null;
  }
  const texto = String(val).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dma = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return dma ? `${dma[3]}-${dos(+dma[2])}-${dos(+dma[1])}` : null;
}

export function parseBooleanFlag(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  const s = normalizeHeaderKey(String(value));
  return s === 'true' || s === '1' || s === 'si' || s === 'x' || s === 'activo';
}

export function buildKey(...parts: (string | number)[]): string {
  return parts.map((p) => String(p).trim().toLowerCase()).join('|');
}

/**
 * Arma el mensaje de error completo a partir de la excepcion capturada.
 *
 * `err.message` (lo unico que se usaba antes) suele ser solo la linea principal que
 * entrega el driver de Postgres (ej. "duplicate key value violates unique constraint
 * \"PK_xxx\""), SIN la parte que dice que valor exacto choco. Postgres manda esa parte
 * ("Key (cod_ocupacion_cno)=(12345) already exists.") en el campo `detail`, aparte, junto
 * con `code` (codigo de error SQLSTATE), `constraint`, `table` y `column`. Esta funcion
 * arma un mensaje unico con todo ese detalle para que quede exacto y completo.
 */
export function describeDbError(err: any): string {
  const parts: string[] = [String(err?.message ?? err)];
  if (err?.code) parts.push(`codigo_sql=${err.code}`);
  if (err?.detail) parts.push(`detalle=${err.detail}`);
  if (err?.constraint) parts.push(`restriccion=${err.constraint}`);
  if (err?.table) parts.push(`tabla=${err.table}`);
  if (err?.column) parts.push(`columna=${err.column}`);
  // Los errores que envuelve TypeORM (QueryFailedError) guardan el error crudo del driver
  // en `.driverError`, que a veces trae detalle/code que el wrapper no copio al nivel superior.
  const inner = err?.driverError;
  if (inner) {
    if (inner.code && !err?.code) parts.push(`codigo_sql=${inner.code}`);
    if (inner.detail && !err?.detail) parts.push(`detalle=${inner.detail}`);
    if (inner.constraint && !err?.constraint) parts.push(`restriccion=${inner.constraint}`);
  }
  return parts.join(' | ');
}

export function formatImportError(detail: ImportErrorDetail): string {
  const loc = '[' + detail.sheet + ' - fila ' + detail.excelRow + ']';
  const ocup = detail.ocupacionCodigo
    ? ' Ocupacion \'' + detail.ocupacionCodigo + '\'' + (detail.ocupacionNombre ? ' (' + detail.ocupacionNombre + ')' : '') + '.'
    : '';
  const related = detail.relatedCodigo
    ? ' Registro relacionado \'' + detail.relatedCodigo + '\'' + (detail.relatedNombre ? ' (' + detail.relatedNombre + ')' : '') + '.'
    : '';
  return loc + ocup + related + ' Operacion: ' + detail.operation + '. Error: ' + detail.originalMessage;
}

export interface SkipDetail {
  sheet: string;
  excelRow: number;
  naturalKey: string;
  nombre?: string;
  reason: string;
}

/** Mismo formato que formatImportError pero para filas contadas en "omitidos" (skipped),
 *  asi se puede verificar exactamente que codigo fue y por que no se creo/actualizo. */
export function formatSkipDetail(detail: SkipDetail): string {
  const loc = '[' + detail.sheet + ' - fila ' + detail.excelRow + ']';
  const nombre = detail.nombre ? ' (' + detail.nombre + ')' : '';
  return `${loc} Codigo '${detail.naturalKey}'${nombre}. Motivo: ${detail.reason}`;
}

// Primitivas de sincronizacion por lotes
//
// El cargue corre dentro de UNA transaccion por hoja, y una transaccion vive en una
// sola conexion, que no puede ejecutar queries en paralelo. Por eso aqui ya no hay
// concurrencia por fila (ni los KeyLocks que hacian falta para serializarla, ni el
// findOrCreate/createRelationIfMissing que hacian un viaje a la base por fila):
// cada hoja se resuelve entera en memoria contra lo que ya existe en BD y despues se
// vuelca con INSERT/UPDATE multi-fila. Ademas de ser compatible con la transaccion,
// cambia decenas de miles de viajes a la base por unas pocas decenas.

/**
 * Filas por sentencia. Postgres admite hasta 65535 parametros por statement; con
 * ~8 columnas por fila, 500 filas son ~4000 parametros, bien por debajo del limite
 * incluso en las tablas mas anchas.
 */
export const TAMANO_LOTE = 500;

/** INSERT multi-fila, en lotes de `tamano`. Solo para filas que se sabe que no existen. */
export async function insertarEnLotes<T extends object>(
  manager: EntityManager,
  entidad: EntityTarget<T>,
  filas: DeepPartial<T>[],
  tamano: number = TAMANO_LOTE,
): Promise<void> {
  for (let i = 0; i < filas.length; i += tamano) {
    await manager.insert(entidad, filas.slice(i, i + tamano) as any);
  }
}

/** UPDATE en lotes de entidades ya cargadas desde BD (traen su PK, asi que save() actualiza). */
export async function guardarEnLotes<T extends object>(
  manager: EntityManager,
  entidad: EntityTarget<T>,
  filas: T[],
  tamano: number = TAMANO_LOTE,
): Promise<void> {
  for (let i = 0; i < filas.length; i += tamano) {
    await manager.save(entidad, filas.slice(i, i + tamano) as any);
  }
}
