import { normalizeText } from '../../shared/ui/list';
/**
 * Resumen / Reportes (versión desplegada `/clasificacion/resumen`): vista consolidada de los
 * formularios que el experto validó, con la calificación de cada criterio. Los datos salen de
 * `GET /api/resumen` (una fila por instrumento: la «agrupación»; solo validaciones cerradas).
 */

/**
 * Calificación de un criterio: las tres que da el experto (Aplica, Con propuesta de mejora, No aplica; Paola, 2026-10-28,
 * en lugar del «Parcial» de la desplegada). «Requiere ajuste» solo existe en validaciones guardadas antes y «Sin dato» es un
 * criterio que quedó sin calificar: se muestran únicamente si aparecen.
 */
export type CriterionState = 'aplica' | 'propuesta_mejora' | 'no_aplica' | 'requiere_ajuste' | 'sin_dato';

/** Calificaciones del reporte, en el orden de las leyendas y los filtros. */
export const CRITERION_STATES: readonly CriterionState[] = ['aplica', 'propuesta_mejora', 'no_aplica', 'requiere_ajuste', 'sin_dato'];

/** Las que se califican hoy (las del filtro «Coincidencia»). */
export const GRADED_STATES: readonly CriterionState[] = ['aplica', 'propuesta_mejora', 'no_aplica'];

/** Calificación del experto (backend) → la del reporte (el mismo nombre). */
export function criterionStateOf(estado: string): CriterionState {
  switch (estado) {
    case 'aplica':
      return 'aplica';
    case 'no_aplica':
      return 'no_aplica';
    case 'propuesta_mejora':
      return 'propuesta_mejora';
    case 'requiere_ajuste':
      return 'requiere_ajuste';
    default:
      return 'sin_dato';
  }
}

/** Familia de un criterio: los cuatro datos de la ocupación y las cinco listas. */
export type CriterionFamily = 'name' | 'area' | 'level' | 'description' | 'functions' | 'denominations' | 'skills' | 'knowledge' | 'related';

/** Número del criterio de cada familia (el mismo de Validación experta). */
export const FAMILY_NUMBER: Record<CriterionFamily, number> = {
  name: 1,
  area: 2,
  level: 3,
  description: 4,
  functions: 5,
  denominations: 6,
  skills: 7,
  knowledge: 8,
  related: 9
};

/** Familias de varios elementos (se agrupan en la ficha y se numeran «Funciones 1», «Funciones 2»…). */
export const LIST_FAMILIES: readonly CriterionFamily[] = ['functions', 'denominations', 'skills', 'knowledge', 'related'];

/** Un criterio calificado de una ocupación. */
export interface ReportCriterion {
  /** `<copia de la ocupación>::<campo>`: el campo es el del snapshot que calificó el experto («funcion_2»). */
  id: string;
  family: CriterionFamily;
  /** Posición dentro de su familia (1, 2…); 0 en los cuatro datos de la ocupación. */
  n: number;
  state: CriterionState;
  /** Lo que se validó (el texto del elemento). */
  value: string;
  /** Comentario del experto. */
  comment: string;
}

/** Resultado de una ocupación o de un envío completo, con las mismas tres calificaciones. */
export type Evaluation = 'aplica' | 'propuesta_mejora' | 'no_aplica' | 'sin_evaluacion';

/** Resultados posibles de un envío, en el orden de los indicadores. */
export const EVALUATIONS: readonly Exclude<Evaluation, 'sin_evaluacion'>[] = ['aplica', 'propuesta_mejora', 'no_aplica'];

/**
 * Resultado con las calificaciones reales (Paola, 2026-10-28; reemplaza Aprobado / Con mejoras / Parcial / No aprobado de
 * la desplegada) y la misma regla con la que Validación experta decide el veredicto: algún No aplica → No aplica (se
 * piden ajustes); si no, alguna Con propuesta de mejora → Con propuesta de mejora; todo Aplica → Aplica. Un «Requiere
 * ajuste» guardado antes cuenta como propuesta de mejora.
 */
export function evaluate(criteria: ReadonlyArray<Pick<ReportCriterion, 'state'>>): Evaluation {
  let apply = 0;
  let notApply = 0;
  let improve = 0;
  for (const { state } of criteria) {
    if (state === 'aplica') apply++;
    else if (state === 'no_aplica') notApply++;
    else if (state === 'propuesta_mejora' || state === 'requiere_ajuste') improve++;
  }
  if (notApply > 0) {
    return 'no_aplica';
  }
  if (improve > 0) {
    return 'propuesta_mejora';
  }
  return apply > 0 ? 'aplica' : 'sin_evaluacion';
}

/** Cuántos criterios hay de cada calificación (solo las que aparecen), para mostrar la calificación real de un envío. */
export function gradeCounts(criteria: ReadonlyArray<Pick<ReportCriterion, 'state'>>): Array<{ state: CriterionState; count: number }> {
  return CRITERION_STATES.map((state) => ({ state, count: criteria.filter((item) => item.state === state).length })).filter((item) => item.count > 0);
}

/** Clasificación por la proporción de criterios en «Aplica» (`resolveClasificacion` de la desplegada). */
export type Classification = 'alta' | 'media' | 'baja' | 'sin_clasificar';

/** Clasificaciones por proporción de criterios que aplican. */
export const CLASSIFICATIONS: readonly Classification[] = ['alta', 'media', 'baja', 'sin_clasificar'];

/** Clasificación por la proporción de Aplica: alta desde 75 %, media desde 45 %, baja por debajo; sin criterios, sin clasificar. */
export function classify(criteria: ReadonlyArray<Pick<ReportCriterion, 'state'>>): Classification {
  if (!criteria.length) {
    return 'sin_clasificar';
  }
  const ratio = criteria.filter((item) => item.state === 'aplica').length / criteria.length;
  return ratio >= 0.75 ? 'alta' : ratio >= 0.45 ? 'media' : 'baja';
}

/** Umbral base de coincidencia del reporte (las estadísticas y su descarga). */
export const BASE_THRESHOLD = 60;

/** Puntaje de coincidencia (0–100): Aplica 100, Con propuesta de mejora 60, No aplica 0 y lo demás 30, en promedio. */
export function coincidenceScore(criteria: ReadonlyArray<Pick<ReportCriterion, 'state'>>): number {
  if (!criteria.length) {
    return 0;
  }
  const points = criteria.reduce((sum, { state }) => sum + (state === 'aplica' ? 100 : state === 'propuesta_mejora' ? 60 : state === 'no_aplica' ? 0 : 30), 0);
  return points / criteria.length;
}

/** Ocupación validada dentro de un envío. */
export interface ReportOccupation {
  code: string;
  /** CNO (4 dígitos) o CUOC (5 dígitos). */
  catalog: 'CNO' | 'CUOC';
  name: string;
  level: string;
  criteria: ReportCriterion[];
  evaluation: Evaluation;
}

/** Fila del reporte: un envío (agrupación) con sus ocupaciones. */
export interface ReportRecord {
  /** Número de la fila (1, 2…), en orden de agrupación. */
  id: number;
  /** Id del instrumento: la agrupación. */
  group: number;
  kind: 'I2' | 'I3';
  /** Fecha y hora ISO: cuándo se registró el instrumento y cuándo el experto cerró la validación. */
  startedAt: string;
  finishedAt: string;
  date: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  city: string;
  company: string;
  position: string;
  profession: string;
  sector: string;
  occupations: ReportOccupation[];
  evaluation: Evaluation;
  classification: Classification;
  /** Puntaje de coincidencia de todo el envío. */
  score: number;
  /** Observaciones generales del experto. */
  observations: string;
}

/** Todos los criterios del envío (de todas sus ocupaciones). */
export function allCriteria(record: ReportRecord): ReportCriterion[] {
  return record.occupations.flatMap((occupation) => occupation.criteria);
}

/* ---------- Filtros ---------- */

/** Filtros del modal "Filtrar"; un valor vacío no filtra. */
export interface ReportFilters {
  /** AAAA-MM-DD; vacíos = sin límite. */
  from: string;
  to: string;
  department: string;
  city: string;
  company: string;
  profession: string;
  position: string;
  /** Registros con al menos un criterio en ese estado. */
  coincidence: '' | 'aplica' | 'no_aplica' | 'propuesta_mejora';
  classification: '' | Classification;
}

/** Filtros vacíos. */
export function emptyFilters(): ReportFilters {
  return { from: '', to: '', department: '', city: '', company: '', profession: '', position: '', coincidence: '', classification: '' };
}

/** Cuántos filtros tienen valor (para el contador del botón). */
export function activeFilterCount(filters: ReportFilters): number {
  return Object.values(filters).filter(Boolean).length;
}

/** El envío cumple todos los filtros. La coincidencia se cumple si algún criterio tiene esa calificación. */
export function matchesFilters(record: ReportRecord, filters: ReportFilters): boolean {
  const day = record.date.slice(0, 10);
  return (
    (!filters.from || day >= filters.from) &&
    (!filters.to || day <= filters.to) &&
    (!filters.department || record.department === filters.department) &&
    (!filters.city || record.city === filters.city) &&
    (!filters.company || record.company === filters.company) &&
    (!filters.profession || record.profession === filters.profession) &&
    (!filters.position || record.position === filters.position) &&
    (!filters.coincidence || allCriteria(record).some((item) => item.state === filters.coincidence)) &&
    (!filters.classification || record.classification === filters.classification)
  );
}

/** Texto con el que se busca (ocupaciones, informante, empresa, cargo, códigos…), sin tildes ni mayúsculas. */
export function searchableText(record: ReportRecord): string {
  return normalizeText(
    [
      record.group,
      record.fullName,
      record.email,
      record.phone,
      record.department,
      record.city,
      record.company,
      record.position,
      record.profession,
      record.sector,
      ...record.occupations.flatMap((item) => [item.code, item.name, item.level])
    ].join(' ')
  );
}

/** Valores distintos de un campo, ordenados (opciones de los filtros). */
export function distinctValues(records: ReportRecord[], pick: (record: ReportRecord) => string): string[] {
  return [...new Set(records.map(pick).filter((value) => value.trim()))].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Fecha ISO → «2026-10-19 15:14» en hora local (como la desplegada); vacía si no hay. */
export function dateTime(iso: string): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Columnas por las que se ordena el reporte. */
export type ReportSortColumn = 'id' | 'occupations' | 'group' | 'kind' | 'startedAt' | 'finishedAt' | 'date' | 'fullName' | 'email' | 'phone' | 'department' | 'city' | 'company' | 'position' | 'profession' | 'sector' | 'evaluation';

