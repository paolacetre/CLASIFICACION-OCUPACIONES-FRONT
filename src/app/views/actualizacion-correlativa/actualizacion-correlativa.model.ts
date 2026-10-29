/** Un extremo de la relación: el código real del catálogo y su nombre. */
export interface CorrelativeItem {
  code: string;
  name: string;
}

/**
 * Correlativa de UNA ocupación CNO con sus ocupaciones CUOC. En la base cada par CNO-CUOC es una
 * fila (`correlativa_ocupacion`); aquí las filas de una misma CNO se agrupan, porque así se crea
 * y se lee en pantalla. La CNO es la identidad: volver a guardarla reemplaza sus CUOC.
 */
export interface CorrelativeRelation {
  cno: CorrelativeItem;
  cuoc: CorrelativeItem[];
  /**
   * Observación de la relación (cadena vacía si no tiene). Guardar reemplaza todas las filas de
   * la CNO, así que se reenvía para no borrarla; si sus filas traían observaciones distintas (de
   * un Excel), van todas juntas separadas por «; ».
   */
  observation: string;
}

/** Los tres tipos de Excel que acepta «Cargar Excel» (`POST /api/correlativa/upload/:tipo`). */
export type CorrelativeUploadType = 'denominacion' | 'ocupacion' | 'conocimiento';

/** Tipos que se pueden cargar por Excel, en el orden del modal. */
export const CORRELATIVE_UPLOAD_TYPES: readonly CorrelativeUploadType[] = ['denominacion', 'ocupacion', 'conocimiento'];

/** Resultado de una carga, como lo resume el servidor. */
export interface CorrelativeUploadResult {
  message: string;
  inserted: number;
  skipped: number;
  errors: string[];
  skippedDetails: string[];
  warnings: string[];
}

/** Avance de una carga: la subida es el 90 % y el resto lo que tarda el servidor en procesar. */
export interface CorrelativeUploadProgress {
  progress: number;
  messageKey: string;
  done: boolean;
  result?: CorrelativeUploadResult;
}

/** Fila de un panel (CNO o CUOC). */
export interface CatalogRow {
  code: string;
  name: string;
}

/** Lo que el panel pide a su catálogo: búsqueda, filtros y página (los resuelve el servidor). */
export interface CatalogCriteria {
  query: string;
  area: string;
  status: '' | 'Activo' | 'Inactivo';
  page: number;
  pageSize: number;
}

/** Una página de un panel de ocupaciones y el total que cumple la búsqueda. */
export interface CatalogPage {
  items: CatalogRow[];
  total: number;
}

/** Una relación parte de UNA ocupación CNO; de ella pueden colgar hasta 10 CUOC (como el original). */
export const CNO_LIMIT = 1;
/**
 * Máximo de ocupaciones CUOC que se relacionan con una CNO a la vez. Una relación que ya trae más
 * (cargada por Excel) se edita con todas las suyas: recortarla borraría las que sobran al guardar.
 */
export const CUOC_LIMIT = 10;

/** Tarjetas de relaciones que se muestran antes de pulsar «Ver todas». */
export const VISIBLE_RELATIONS = 4;

/** Códigos que caben en el resumen de la barra de selección antes de cortar con «+N». */
export const CODES_IN_SUMMARY = 6;

/** Ordena códigos como números cuando lo son («0011» antes que «0110»). */
export function compareCodes(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Agrupa las filas CNO-CUOC por ocupación CNO, en orden de código, juntando sus observaciones sin repetirlas. */
export function groupRelations(
  rows: ReadonlyArray<{ cnoCode: string; cnoName: string; cuocCode: string; cuocName: string; observation?: string }>
): CorrelativeRelation[] {
  const byCno = new Map<string, CorrelativeRelation>();
  const observations = new Map<string, string[]>();
  for (const row of rows) {
    const cuoc = { code: row.cuocCode, name: row.cuocName };
    const existing = byCno.get(row.cnoCode);
    if (existing) {
      existing.cuoc.push(cuoc);
    } else {
      byCno.set(row.cnoCode, { cno: { code: row.cnoCode, name: row.cnoName }, cuoc: [cuoc], observation: '' });
      observations.set(row.cnoCode, []);
    }
    const observation = row.observation?.trim() ?? '';
    const notes = observations.get(row.cnoCode)!;
    if (observation && !notes.includes(observation)) {
      notes.push(observation);
    }
  }
  return [...byCno.values()]
    .map((relation) => ({ ...relation, observation: observations.get(relation.cno.code)!.join('; ') }))
    .sort((a, b) => compareCodes(a.cno.code, b.cno.code));
}

/** Búsqueda en «Relaciones existentes»: por código o nombre, de cualquiera de los dos lados. */
export function matchesRelation(relation: CorrelativeRelation, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const matches = (item: CorrelativeItem) => item.code.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle);
  return matches(relation.cno) || relation.cuoc.some(matches);
}

/** «0011, 0012, 0013» y, si son muchos, corta con «+N». */
export function summarizeCodes(codes: string[]): string {
  return codes.length <= CODES_IN_SUMMARY ? codes.join(', ') : `${codes.slice(0, CODES_IN_SUMMARY).join(', ')} +${codes.length - CODES_IN_SUMMARY}`;
}
