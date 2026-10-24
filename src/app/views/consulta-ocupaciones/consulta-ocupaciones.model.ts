import { Observable } from 'rxjs';
import type { CnoOccupationDetail, CnoSortColumn, FilterOption, OccupationStatus } from '../cno/cno.model';
import type { CuocFilterOptions, CuocItem, CuocOccupation, CuocOccupationDetail } from '../cuoc/cuoc.model';

/**
 * Tipos de la pantalla común de Consulta (CNO y CUOC). Cada clasificación
 * conserva su modelo y su servicio (el backend es distinto y otras vistas los
 * usan); aquí está solo lo que la pantalla necesita de los dos.
 */

export type { FilterOption };

/** Clasificación que consulta la pantalla: decide el servicio, los textos (`cno.*` o `cuoc.*`) y las partes propias de cada una. */
export type ConsultaClassification = 'cno' | 'cuoc';

/**
 * Filtros de la consulta; una cadena vacía es "sin filtrar". CNO usa nivel,
 * área, función y estado; CUOC además gran grupo y grupo primario (su servicio
 * no envía lo que no usa).
 */
export interface ConsultaFilters {
  /** Código o parte del nombre: se busca mientras se escribe. */
  query: string;
  area: string;
  status: OccupationStatus | '';
  /** Opcionales porque no los usan todas las vistas que consultan los servicios de CNO y CUOC. */
  level?: string;
  function?: string;
  majorGroup?: string;
  primaryGroup?: string;
}

/** Filtros que van en la tarjeta «Filtros de búsqueda» (todos menos el texto buscado). */
export type ConsultaFilterKey = Exclude<keyof ConsultaFilters, 'query'>;

/** Opciones de los filtros: las de CUOC (que incluyen las de CNO); en CNO la jerarquía queda vacía. */
export type ConsultaFilterOptions = CuocFilterOptions;

/** Columnas por las que se ordena; `level` solo en CNO. */
export type ConsultaSortColumn = CnoSortColumn;

/** Ocupación en la tabla de resultados; `levelCode` solo llega en CNO. */
export type ConsultaOccupation = CuocOccupation & { levelCode?: string };

/** Componente de una ocupación con su código (función, denominación, habilidad o destreza, conocimiento). */
export type ConsultaItem = CuocItem;

/** Perfil de una ocupación. El código del nivel solo llega en CNO; el grupo primario solo en CUOC. */
export type ConsultaDetail = Omit<CuocOccupationDetail, 'primaryGroup'> & { primaryGroup?: string } & Partial<Pick<CnoOccupationDetail, 'levelCode'>>;

/** Pestañas del perfil de una ocupación. */
export type ConsultaDetailTab = 'general' | 'functions' | 'denominations' | 'skills' | 'knowledge' | 'related';

/** Consulta completa: filtros, página y orden (los resuelve el backend). */
export interface ConsultaQuery extends ConsultaFilters {
  page: number;
  pageSize: number;
  sort: ConsultaSortColumn;
  ascending: boolean;
}

/**
 * Lo que la pantalla pide al servicio de su clasificación. `CnoService` y
 * `CuocService` ya cumplen esta forma (mismos métodos y datos equivalentes).
 */
export interface ConsultaSource {
  filterOptions(): Observable<Partial<ConsultaFilterOptions>>;
  search(query: ConsultaQuery): Observable<{ items: ConsultaOccupation[]; total: number }>;
  detail(code: string): Observable<ConsultaDetail>;
}

/** Filtros vacíos (sin búsqueda): la pantalla muestra la invitación a buscar. */
export function createEmptyFilters(): ConsultaFilters {
  return { query: '', level: '', area: '', function: '', status: '', majorGroup: '', primaryGroup: '' };
}

/** Hay algo que consultar: texto de búsqueda o algún filtro elegido. */
export function hasActiveFilters(filters: ConsultaFilters): boolean {
  return !!(filters.query.trim() || filters.level || filters.area || filters.function || filters.status || filters.majorGroup || filters.primaryGroup);
}

/** Columna que se puede llevar al Excel de la consulta (modal «Exportar a Excel»). */
export interface ExportColumn {
  key: 'code' | 'name' | 'area' | 'status' | 'denominationsCount' | 'functionsCount' | 'skillsCount' | 'knowledgeCount';
  /** Título de la columna (clave sin el prefijo de la clasificación). */
  labelKey: string;
}

/** Columnas del Excel, las mismas del modal del front original. */
export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  { key: 'code', labelKey: 'exportColCode' },
  { key: 'name', labelKey: 'exportColName' },
  { key: 'area', labelKey: 'exportColArea' },
  { key: 'status', labelKey: 'exportColStatus' },
  { key: 'denominationsCount', labelKey: 'denominations' },
  { key: 'functionsCount', labelKey: 'functions' },
  { key: 'skillsCount', labelKey: 'skills' },
  { key: 'knowledgeCount', labelKey: 'knowledge' }
];
