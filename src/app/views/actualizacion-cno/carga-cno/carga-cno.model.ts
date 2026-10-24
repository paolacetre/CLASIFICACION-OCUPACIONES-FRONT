/**
 * Modelo de "Cargar información CNO": cargar el Excel oficial completo o un
 * tipo a la vez, revisándolo antes en el servidor (`/api/cno/upload/...`).
 */

/** Tipos que carga el servidor, en el orden en que se cargan con "Todo el archivo". */
export type UploadType = 'nivel' | 'area' | 'habilidades' | 'conocimientos' | 'ocupacion';

/** Orden en que "Todo el archivo" carga los tipos en CNO: primero lo que las ocupaciones necesitan. */
export const UPLOAD_ORDER: readonly UploadType[] = ['nivel', 'area', 'habilidades', 'conocimientos', 'ocupacion'];

/** Orden de "Todo el archivo" en CUOC, el de la versión desplegada (las destrezas al final). */
export const CUOC_UPLOAD_ORDER: readonly UploadType[] = ['nivel', 'area', 'conocimientos', 'ocupacion', 'habilidades'];

/** Orden de "Todo el archivo" según la clasificación. */
export function uploadOrder(classification: 'cno' | 'cuoc'): readonly UploadType[] {
  return classification === 'cuoc' ? CUOC_UPLOAD_ORDER : UPLOAD_ORDER;
}

/** Plantillas oficiales: una por tipo y la completa. */
export type TemplateType = UploadType | 'completa';

/** Íconos (trazos SVG) de cada tipo, como en la versión desplegada. */
export const UPLOAD_ICONS: Record<UploadType, string> = {
  nivel: 'M6 20V10M12 20V4M18 20v-6',
  area: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15',
  habilidades: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z',
  conocimientos: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4ZM5 17a3 3 0 0 1 3-3h11',
  ocupacion: 'M3 8h18v12H3zM8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18'
};

/** Archivos que se aceptan: Excel de hasta 10 MB, como en la versión desplegada (el servidor admite 50). */
export const UPLOAD_EXTENSIONS = ['.xlsx', '.xls'];
/** Tamaño máximo del Excel (MB), el mismo que acepta el servidor. */
export const UPLOAD_MAX_MB = 10;

/** Filas con error que se muestran en la revisión (el resto se resume). */
export const MAX_ERROR_ROWS = 25;

/** Líneas por hoja que se muestran en el resultado (errores, avisos y omitidas). */
export const MAX_RESULT_LINES = 10;

/** El nombre termina en `.xlsx` o `.xls`. */
export function isExcelName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return UPLOAD_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Tamaño legible: "850 KB", "1.2 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Revisión del archivo (POST /api/cno/upload/:tipo/validar) ----------

/** Un campo que el sistema espera y si el archivo lo trae. */
export interface ExpectedColumn {
  key: string;
  name: string;
  /** Encabezado del archivo que le corresponde, si se encontró. */
  header: string | null;
  found: boolean;
  required: boolean;
}

/** Una columna tal como viene en el archivo, corresponda o no a un campo. */
export interface FileColumn {
  header: string;
  mapped: boolean;
  mappedTo: string | null;
  mappedLabel: string | null;
}

/** Fila del Excel que el servidor rechazó, con el campo y el motivo. */
export interface RowError {
  row: number;
  field: string;
  value: string;
  message: string;
  suggestion: string;
}

/** Informe de la revisión: nada se ha guardado todavía. */
export interface FileReview {
  valid: boolean;
  /** Hoja del libro donde se encontraron los encabezados. */
  sheet: string | null;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  columns: ExpectedColumn[];
  /** Columnas obligatorias que faltan. */
  missingColumns: string[];
  allColumns: FileColumn[];
  totalColumns: number;
  preview: { headers: string[]; rows: string[][] };
  errors: RowError[];
  /** Si el archivo parece de otro tipo, cuál. */
  looksLike: UploadType | null;
  message: string;
}

/** Faltan columnas obligatorias o no hay filas: no se puede cargar. */
export function reviewBlocks(review: FileReview): boolean {
  return review.missingColumns.length > 0 || review.totalRecords === 0;
}

// ---------- Resultado de la carga (POST /api/cno/upload/:tipo) ----------

/** Resultado de una hoja del Excel (cuántas filas guardó, actualizó o rechazó). */
export interface SheetOutcome {
  sheet: string;
  message: string;
  inserted: number;
  updated: number;
  skipped: number;
  unreadable: number;
  errors: string[];
  warnings: string[];
  skippedDetails: string[];
}

/** Resumen de una carga, como lo entrega el servidor. */
export interface UploadResult {
  message: string;
  inserted: number;
  updated: number;
  skipped: number;
  unreadable: number;
  errors: number;
  warnings: number;
  sheets: SheetOutcome[];
}

/** Suma varios resultados (los de "Todo el archivo"). */
export function sumResults(results: UploadResult[]): UploadResult {
  const total = (pick: (result: UploadResult) => number) => results.reduce((sum, result) => sum + pick(result), 0);
  return {
    message: '',
    inserted: total((result) => result.inserted),
    updated: total((result) => result.updated),
    skipped: total((result) => result.skipped),
    unreadable: total((result) => result.unreadable),
    errors: total((result) => result.errors),
    warnings: total((result) => result.warnings),
    sheets: results.flatMap((result) => result.sheets)
  };
}

/** Avance de una carga: porcentaje, mensaje y, al terminar, el resultado. */
export interface UploadProgress {
  progress: number;
  /** Clave de traducción del mensaje. */
  messageKey: string;
  done: boolean;
  result?: UploadResult;
}

/** Estado de cada tipo durante "Todo el archivo". */
export interface TypeStatus {
  type: UploadType;
  state: 'pending' | 'loading' | 'ok' | 'error';
  result?: UploadResult;
  error?: string;
}

/** Veredicto del resultado, con la misma lógica de la versión desplegada. */
export type VerdictState = 'ok' | 'warning' | 'partial' | 'unchanged' | 'empty' | 'failed';

/** Veredicto de una carga para mostrar al usuario: estado, título y frases. */
export interface Verdict {
  state: VerdictState;
  /** Clave y parámetros del título y del texto. */
  titleKey: string;
  titleParams: Record<string, string | number>;
  parts: { key: string; params: Record<string, string | number> }[];
}

/**
 * Veredicto de una carga, con la regla de la versión desplegada: falló (nada guardado y hubo errores), sin cambios (todo ya existía),
 * vacío, parcial (guardó y hubo errores), con advertencias o correcto.
 */
export function verdictOf(result: UploadResult): Verdict {
  const saved = result.inserted + result.updated;
  const failed = result.errors + result.unreadable;
  const problems = [
    ...(result.errors ? [{ key: result.errors === 1 ? 'cargaCno.rowErrorOne' : 'cargaCno.rowErrorMany', params: { count: result.errors } }] : []),
    ...(result.unreadable ? [{ key: result.unreadable === 1 ? 'cargaCno.unreadableOne' : 'cargaCno.unreadableMany', params: { count: result.unreadable } }] : [])
  ];
  const savedPart = { key: 'cargaCno.savedSummary', params: { saved, inserted: result.inserted, updated: result.updated } };
  const skippedPart = result.skipped ? [{ key: 'cargaCno.savedSkipped', params: { count: result.skipped } }] : [];
  if (saved === 0 && failed > 0) {
    return { state: 'failed', titleKey: 'cargaCno.verdictFailed', titleParams: {}, parts: [...problems, { key: 'cargaCno.verdictFailedText', params: {} }] };
  }
  if (saved === 0 && result.skipped > 0) {
    return { state: 'unchanged', titleKey: 'cargaCno.verdictUnchanged', titleParams: {}, parts: [{ key: 'cargaCno.verdictUnchangedText', params: { count: result.skipped } }] };
  }
  if (saved === 0) {
    return { state: 'empty', titleKey: 'cargaCno.verdictEmpty', titleParams: {}, parts: [{ key: 'cargaCno.verdictEmptyText', params: {} }] };
  }
  if (failed > 0) {
    return { state: 'partial', titleKey: 'cargaCno.verdictPartial', titleParams: { count: failed }, parts: [savedPart, ...skippedPart, ...problems, { key: 'cargaCno.verdictPartialText', params: {} }] };
  }
  if (result.warnings > 0) {
    return { state: 'warning', titleKey: 'cargaCno.verdictWarning', titleParams: {}, parts: [savedPart, ...skippedPart, { key: 'cargaCno.verdictWarningText', params: { count: result.warnings } }] };
  }
  return { state: 'ok', titleKey: 'cargaCno.verdictOk', titleParams: {}, parts: [savedPart, ...skippedPart] };
}
