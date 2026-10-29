import { AnalysisItem, AnalysisListKey, AnalysisOccupation } from '../analisis/analisis.model';
import { PAGE_SIZES, normalizeText } from '../../shared/ui/list';

/**
 * Estado de una comparativa (el servicio lo traduce del estado del backend):
 * - Recibido: llegó de Análisis, sin tocar aquí.
 * - Editado: con cambios guardados aquí, o devuelta por el experto con ajustes.
 * - En Instrumento 2: lista para enviar al experto.
 * - Enviado: en manos del experto.
 * - Diligenciado: el experto ya emitió veredicto.
 */
export type ComparisonStatus = 'Recibido' | 'Editado' | 'En Instrumento 2' | 'Diligenciado' | 'Enviado';

/** Estados en el orden en que se muestran las tarjetas de resumen. */
export const COMPARISON_STATUSES: ComparisonStatus[] = ['Recibido', 'Editado', 'En Instrumento 2', 'Diligenciado', 'Enviado'];

/**
 * Se puede cambiar mientras no esté en manos del experto (la misma regla del
 * backend). "En Instrumento 2" sigue siendo editable: al guardar un cambio
 * vuelve a "Editado" y hay que enviarla de nuevo.
 */
export function isEditable(status: ComparisonStatus): boolean {
  return status === 'Recibido' || status === 'Editado' || status === 'En Instrumento 2';
}

/** Comparativa: las 2 o 3 ocupaciones que se guardaron juntas en Análisis. */
export interface Comparison {
  id: number;
  occupations: AnalysisOccupation[];
  /** Usuario de quien la guardó en Análisis. */
  analyst: string;
  /** Fecha en que llegó de Análisis (DD/MM/YYYY). */
  date: string;
  status: ComparisonStatus;
  /** Observación de la comparativa (una sola, no una por ocupación); vacía al salir de Análisis. */
  observation: string;
}

/** Lo que se edita de una ocupación en el modo edición de la comparativa: sus datos y sus cinco listas. */
export interface OccupationDraft extends Record<AnalysisListKey, AnalysisItem[]> {
  name: string;
  level: string;
  area: string;
  description: string;
}

/** Cambios de una ocupación listos para guardar: el borrador y el código de su copia. */
export interface OccupationChange extends OccupationDraft {
  copyCode: string;
}

/** Listas de una ocupación, en el orden de las pestañas. */
export const OCCUPATION_LISTS: readonly AnalysisListKey[] = ['functions', 'denominations', 'skills', 'knowledge', 'related'];

/**
 * Listas cuyo texto no se reescribe al editar (se quitan o se agregan del catálogo): el servidor enlaza cada
 * habilidad y cada conocimiento con el catálogo por su nombre exacto, y un texto cambiado crearía uno nuevo en
 * el catálogo oficial.
 */
export const CATALOG_TEXT_LISTS: readonly AnalysisListKey[] = ['skills', 'knowledge'];

/** Borrador de una ocupación con sus valores actuales (copia: editarlo no toca lo guardado). */
export function toDraft(occupation: AnalysisOccupation): OccupationDraft {
  const draft = { name: occupation.name, level: occupation.level, area: occupation.area, description: occupation.description } as OccupationDraft;
  for (const list of OCCUPATION_LISTS) {
    draft[list] = occupation[list].map((item) => ({ ...item }));
  }
  return draft;
}

/** Lista sin los elementos vacíos y con los textos recortados: así se compara y así viaja. */
export function cleanItems(items: AnalysisItem[]): AnalysisItem[] {
  return items.map((item) => ({ code: item.code, text: item.text.trim() })).filter((item) => item.text);
}

/** El borrador difiere de lo guardado (sin contar espacios a los lados ni filas vacías). */
export function draftChanged(occupation: AnalysisOccupation, draft: OccupationDraft): boolean {
  return (
    occupation.name !== draft.name.trim() ||
    occupation.level !== draft.level ||
    occupation.area !== draft.area ||
    occupation.description !== draft.description.trim() ||
    OCCUPATION_LISTS.some((list) => JSON.stringify(cleanItems(occupation[list])) !== JSON.stringify(cleanItems(draft[list])))
  );
}

/** Consulta de la lista; una cadena vacía significa "sin filtrar". */
export interface ComparisonQuery {
  /** ID, parte del nombre o código de una ocupación, o correo del analista. */
  text: string;
  status: ComparisonStatus | '';
  /** Página pedida, desde 1. */
  page: number;
  pageSize: number;
}

/** Una página de comparativas y el total que cumple la consulta. */
export interface ComparisonPage {
  items: Comparison[];
  total: number;
}

/** Cuántas comparativas hay en cada estado. */
export type ComparisonSummary = Record<ComparisonStatus, number>;

/** Consulta inicial: sin texto ni estado, primera página. */
export function createEmptyQuery(): ComparisonQuery {
  return { text: '', status: '', page: 1, pageSize: PAGE_SIZES[0] };
}

/** Aspectos en los que se comparan las ocupaciones (la barra "Comparación"). */
export type ComparisonAspect = 'catalog' | 'level' | 'area' | AnalysisListKey;

/** Aspectos en que se comparan las ocupaciones (marcan si coinciden). */
export const COMPARISON_ASPECTS: ComparisonAspect[] = ['catalog', 'level', 'area', 'functions', 'denominations', 'skills', 'knowledge', 'related'];

/**
 * Las ocupaciones coinciden en un aspecto si todas tienen el mismo valor; en
 * las listas, si todas tienen los mismos textos (sin importar el orden) y
 * alguna tiene al menos uno.
 */
export function aspectMatches(occupations: AnalysisOccupation[], aspect: ComparisonAspect): boolean {
  const values = occupations.map((occupation) => {
    const value = occupation[aspect];
    return typeof value === 'string' ? normalizeText(value) : value.map((item) => normalizeText(item.text)).sort().join('|');
  });
  return !!values[0] && values.every((value) => value === values[0]);
}
