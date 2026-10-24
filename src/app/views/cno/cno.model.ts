/** Estado de una ocupación, como lo entrega la consulta del backend. */
export type OccupationStatus = 'Activo' | 'Inactivo';

/** Opción de un catálogo (nivel de cualificación o área de desempeño). */
export interface CatalogOption {
  /** Código en la base de datos (`codCualificacion`, `codDesempeno`). */
  id: string;
  name: string;
  /** Descripción del catálogo, si la tiene. */
  description: string;
}

/** Catálogos de la CNO (niveles y áreas), los usan Análisis y Correlativa. */
export interface CnoCatalogs {
  levels: CatalogOption[];
  areas: CatalogOption[];
}

/** Opción de un filtro de la consulta: lo que se envía al backend y lo que se ve. */
export interface FilterOption {
  value: string;
  label: string;
  /** Valor del filtro del que depende (p. ej. el gran grupo de un grupo primario en CUOC). */
  parent?: string;
}

/** Opciones de los filtros de la consulta de CNO. */
export interface CnoFilterOptions {
  /** Se filtra por el nombre del nivel y se muestra su código («Nivel 1 (A)»). */
  levels: FilterOption[];
  areas: FilterOption[];
  functions: FilterOption[];
}

/** Ocupación de la CNO, como se lista en la consulta (`GET /api/cno/ocupaciones/consulta`). */
export interface CnoOccupation {
  code: string;
  name: string;
  /** Nombre del nivel de cualificación, p. ej. 'Profesionales, Dirección y Gerencia' (por él filtra el backend). */
  level: string;
  /** Código del nivel, p. ej. 'Nivel 1 (A)': desde el libro CNO 2026 es lo que se muestra. */
  levelCode: string;
  /** Nombre del área de desempeño. */
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

/** Componente de una ocupación (función, denominación, habilidad o conocimiento) con su código. */
export interface CnoItem {
  /** 'F-2111.01', 'D-2111.001' o el número de la habilidad o el conocimiento en su catálogo. */
  code: string;
  text: string;
  /** Las funciones y denominaciones pueden estar inactivas; lo demás siempre es activo. */
  active: boolean;
  /** Fecha de registro de una denominación, tal como llega; vacía si no la tiene. */
  registeredAt?: string;
}

/** Ocupación relacionada con otra (pestaña "Ocupaciones relacionadas"). */
export interface RelatedOccupation {
  code: string;
  name: string;
}

/**
 * Perfil completo de una ocupación (`GET /api/cno/ocupaciones/:cod`). Una
 * cadena vacía significa "sin dato"; las fechas se muestran como llegan. El
 * campo ocupacional no está: el backend solo lo entrega a los usuarios de la APE.
 */
export interface CnoOccupationDetail extends CnoOccupation {
  /** Código del área de desempeño, que se muestra junto a su nombre. */
  areaCode: string;
  description: string;
  levelDescription: string;
  inactiveAt: string;
  traceability: string;
  previousCode: string;
  functions: CnoItem[];
  denominations: CnoItem[];
  skills: CnoItem[];
  knowledge: CnoItem[];
  related: RelatedOccupation[];
}

/** Columnas por las que el backend ordena los resultados. */
export type CnoSortColumn = 'code' | 'name' | 'level' | 'status';

/** Pestañas del perfil de una ocupación. */
export type CnoDetailTab = 'general' | 'functions' | 'denominations' | 'skills' | 'knowledge' | 'related';

/** Filtros de la consulta; una cadena vacía significa "sin filtrar". El backend filtra nivel y área por su nombre. */
export interface CnoFilters {
  /** Código CNO o parte del nombre de la ocupación. */
  query: string;
  level: string;
  area: string;
  status: OccupationStatus | '';
  /** Código o texto de una función (solo la Consulta lo usa). */
  function?: string;
}

/** Consulta completa: filtros, página y orden (los resuelve el backend). */
export interface CnoQuery extends CnoFilters {
  /** Página pedida, desde 1. */
  page: number;
  pageSize: number;
  sort: CnoSortColumn;
  ascending: boolean;
}

/** Una página de resultados y el total de ocupaciones que cumplen la consulta. */
export interface CnoPage {
  items: CnoOccupation[];
  total: number;
}

/** Filtros vacíos (sin búsqueda): la pantalla muestra la invitación a buscar. */
export function createEmptyFilters(): CnoFilters {
  return { query: '', level: '', area: '', status: '', function: '' };
}

/** Hay algo que consultar: texto de búsqueda o algún filtro elegido. */
export function hasActiveFilters(filters: CnoFilters): boolean {
  return !!(filters.query.trim() || filters.level || filters.area || filters.status || filters.function);
}
