import type { FilterOption } from '../cno/cno.model';

/** Estado de una ocupación, como lo entrega la consulta del backend. */
export type OccupationStatus = 'Activo' | 'Inactivo';

/** Opción de un catálogo (área de cualificación o nivel de competencia). */
export interface CatalogOption {
  /** Código en la base de datos (p. ej. 'CNME' en áreas, '4' en niveles). */
  id: string;
  name: string;
  description: string;
}

/** Catálogos de la CUOC (niveles y áreas), los usan Análisis y Correlativa. */
export interface CuocCatalogs {
  levels: CatalogOption[];
  areas: CatalogOption[];
}

/** Opciones de los filtros de la consulta de CUOC (incluida su jerarquía: gran grupo y grupo primario). */
export interface CuocFilterOptions {
  levels: FilterOption[];
  areas: FilterOption[];
  functions: FilterOption[];
  majorGroups: FilterOption[];
  /** Cada grupo primario dice su gran grupo en `parent`. */
  primaryGroups: FilterOption[];
}

/** Ocupación de la CUOC, como se lista en la consulta (`GET /api/cuoc/ocupaciones/consulta`). */
export interface CuocOccupation {
  code: string;
  name: string;
  /** Nombre del nivel de competencia, p. ej. 'Nivel 4'. */
  level: string;
  /** Nombre del área de cualificación. */
  area: string;
  status: OccupationStatus;
  /** Fecha de registro tal como llega; la consulta del backend todavía no la entrega (queda vacía). */
  registeredAt: string;
  /** Cantidad de registros asociados (columnas de la tabla y tarjetas del perfil). */
  denominationsCount: number;
  functionsCount: number;
  skillsCount: number;
  knowledgeCount: number;
}

/** Componente de una ocupación (función, denominación, destreza o conocimiento) con su código. */
export interface CuocItem {
  code: string;
  text: string;
  /** Las funciones y denominaciones pueden estar inactivas; lo demás siempre es activo. */
  active: boolean;
  /** Fecha de registro de una denominación, tal como llega; vacía si no la tiene. */
  registeredAt?: string;
}

/** Ocupación afín a otra (pestaña "Ocupaciones afines"). */
export interface RelatedOccupation {
  code: string;
  name: string;
}

/**
 * Perfil completo de una ocupación (`GET /api/cuoc/ocupaciones/:cod`). Una
 * cadena vacía significa "sin dato"; las fechas se muestran como llegan.
 */
export interface CuocOccupationDetail extends CuocOccupation {
  /** Sigla del área de cualificación (p. ej. 'CNME'), que se muestra junto a su nombre. */
  areaCode: string;
  /** Grupo primario de la jerarquía: «2111 · Físicos y astrónomos». */
  primaryGroup: string;
  description: string;
  /** Descripción del nivel de competencia (en CNO, la del nivel de cualificación). */
  levelDescription: string;
  inactiveAt: string;
  traceability: string;
  /** Código anterior de la ocupación (en CNO, el código anterior CNO). */
  previousCode: string;
  functions: CuocItem[];
  denominations: CuocItem[];
  /** Destrezas. */
  skills: CuocItem[];
  knowledge: CuocItem[];
  related: RelatedOccupation[];
}

/** Columnas por las que el backend ordena los resultados. */
export type CuocSortColumn = 'code' | 'name' | 'status';

/** Pestañas del perfil de una ocupación. */
export type CuocDetailTab = 'general' | 'functions' | 'denominations' | 'skills' | 'knowledge' | 'related';

/** Filtros de la consulta; una cadena vacía significa "sin filtrar". El backend filtra nivel y área por su nombre. */
export interface CuocFilters {
  /** Código CUOC o parte del nombre de la ocupación. */
  query: string;
  area: string;
  status: OccupationStatus | '';
  /** Los demás solo los usa la Consulta. */
  level?: string;
  function?: string;
  /** Código del gran grupo (p. ej. '2'). */
  majorGroup?: string;
  /** Código del grupo primario (p. ej. '2111'). */
  primaryGroup?: string;
}

/** Consulta completa: filtros, página y orden (los resuelve el backend). */
export interface CuocQuery extends CuocFilters {
  /** Página pedida, desde 1. */
  page: number;
  pageSize: number;
  sort: CuocSortColumn;
  ascending: boolean;
}

/** Una página de resultados y el total de ocupaciones que cumplen la consulta. */
export interface CuocPage {
  items: CuocOccupation[];
  total: number;
}

/** Filtros vacíos (sin búsqueda): la pantalla muestra la invitación a buscar. */
export function createEmptyFilters(): CuocFilters {
  return { query: '', area: '', status: '', level: '', function: '', majorGroup: '', primaryGroup: '' };
}

/** Hay algo que consultar: texto de búsqueda o algún filtro elegido. */
export function hasActiveFilters(filters: CuocFilters): boolean {
  return !!(filters.query.trim() || filters.area || filters.status || filters.level || filters.function || filters.majorGroup || filters.primaryGroup);
}
