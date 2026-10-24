import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, throwError } from 'rxjs';
import { ApiPage, fetchAllPages, isNotFound, queryParams, text } from '../../shared/api/http-helpers';
import { displayDate } from '../../shared/format/date';
import {
  CatalogOption,
  CnoCatalogs,
  CnoFilterOptions,
  CnoFilters,
  CnoItem,
  CnoOccupation,
  CnoOccupationDetail,
  CnoPage,
  CnoQuery,
  CnoSortColumn,
  FilterOption,
  OccupationStatus
} from './cno.model';

/** La ocupación pedida no existe (404 del servidor). */
export const OCCUPATION_NOT_FOUND = 'OCCUPATION_NOT_FOUND';

/** Los catálogos de CNO tienen pocas filas: se piden completos en una sola página. */
const CATALOG_LIMIT = 100;

/** Nombre que el backend da a cada columna ordenable (`orden`). */
const SORT_PARAM: Record<CnoSortColumn, string> = { code: 'codigo', name: 'nombre', level: 'nivel', status: 'estado' };

/* ---------- Formas de las respuestas del backend (back/src/modules/cno) ---------- */

interface NivelDto {
  /** Desde el libro CNO 2026 es el nivel exacto: 'Nivel 1 (A)'. */
  codCualificacion: string;
  nivelesCualificacion: string;
  descripcion: string | null;
  /** Copia creada en Análisis (no es del catálogo oficial). */
  esCopia?: boolean;
}

interface AreaDto {
  codDesempeno: string;
  nomDesempeno: string;
  descripcion: string | null;
}

/** Fila de `GET /api/cno/ocupaciones/consulta`. */
interface OcupacionResultadoDto {
  codigo: string;
  nombre: string;
  codNivelCualificacion?: string | null;
  nivelCualificacion?: string | null;
  areaDesempeno?: string | null;
  estado: string;
  /** La consulta todavía no la entrega; se lee por si la agrega. */
  fechaRegistro?: string | null;
  denominaciones: number;
  funciones: number;
  habilidades: number;
  conocimientos: number;
}

/** Estado de una función o denominación: 1/0, true/false o 'Activo'/'Inactivo' (sin valor = activa). */
type EstadoDto = number | boolean | string | null | undefined;

/** `GET /api/cno/ocupaciones/:cod`. */
interface OcupacionDto {
  codOcupacionCno: string;
  nombOcupacionCno: string;
  descripcion: string | null;
  nomDesempeno: string | null;
  nivelesCualificacion: string | null;
  estado: boolean;
  fechaRegistro: string | null;
  fechaInactivacion: string | null;
  trazabilidad: string | null;
  codAnteOcupacionCno: string | null;
  areaDesempeno: AreaDto | null;
  nivelCualificacion: NivelDto | null;
  denominaciones: { codDenominacionCno: string; descDenominacion: string; estado?: EstadoDto; fechaReg?: string | null }[];
  funciones: { codigo: string; descFuncionCno: string; estado?: EstadoDto }[];
  habilidades: { nombHabDest: string; habilidadDestreza: { codHabDest: number } | null }[];
  conocimientos: { nombConocimiento: string; conocimiento: { codConocimiento: number } | null }[];
  relacionadas: { codigoOcupacion: string; nombreCnoRelacionada: string }[];
}

/** `GET /api/cno/funciones/opciones`: las funciones que tienen las ocupaciones, para el filtro. */
interface FuncionOpcionDto {
  codigo: string;
  nombre: string;
}

function toStatus(active: boolean): OccupationStatus {
  return active ? 'Activo' : 'Inactivo';
}

/** Una función o denominación está activa salvo que el backend diga lo contrario. */
export function isActiveState(estado: EstadoDto): boolean {
  if (estado === null || estado === undefined || estado === '') {
    return true;
  }
  return !(estado === 0 || estado === false || /^(0|false|inactiv[oa])$/i.test(String(estado).trim()));
}

/**
 * Opciones del filtro de nivel: una por nombre (por él filtra el backend), en
 * el orden de los códigos y mostrando el código («Nivel 1 (A)»), como el front
 * original (`opcionesNivel`). Las copias de Análisis no se ofrecen.
 */
export function levelOptions(levels: readonly NivelDto[]): FilterOption[] {
  const seen = new Set<string>();
  return [...levels]
    .filter((level) => !level.esCopia)
    .sort((a, b) => a.codCualificacion.localeCompare(b.codCualificacion, 'es', { numeric: true }))
    .filter((level) => {
      const name = level.nivelesCualificacion?.trim();
      if (!name || seen.has(name)) {
        return false;
      }
      seen.add(name);
      return true;
    })
    .map((level) => ({ value: level.nivelesCualificacion.trim(), label: level.codCualificacion.trim() || level.nivelesCualificacion.trim() }));
}

function toRow(dto: OcupacionResultadoDto): CnoOccupation {
  return {
    code: dto.codigo,
    name: dto.nombre,
    level: text(dto.nivelCualificacion),
    levelCode: text(dto.codNivelCualificacion) || text(dto.nivelCualificacion),
    area: text(dto.areaDesempeno),
    status: dto.estado === 'Inactivo' ? 'Inactivo' : 'Activo',
    registeredAt: displayDate(dto.fechaRegistro),
    denominationsCount: dto.denominaciones,
    functionsCount: dto.funciones,
    skillsCount: dto.habilidades,
    knowledgeCount: dto.conocimientos
  };
}

function toDetail(dto: OcupacionDto): CnoOccupationDetail {
  const level = text(dto.nivelCualificacion?.nivelesCualificacion ?? dto.nivelesCualificacion);
  const item = (code: string | number | null | undefined, value: string, active = true): CnoItem => ({ code: text(code), text: value, active });
  return {
    code: dto.codOcupacionCno,
    name: dto.nombOcupacionCno,
    level,
    levelCode: text(dto.nivelCualificacion?.codCualificacion) || level,
    area: text(dto.areaDesempeno?.nomDesempeno ?? dto.nomDesempeno),
    areaCode: text(dto.areaDesempeno?.codDesempeno),
    status: toStatus(dto.estado),
    denominationsCount: dto.denominaciones.length,
    functionsCount: dto.funciones.length,
    skillsCount: dto.habilidades.length,
    knowledgeCount: dto.conocimientos.length,
    description: text(dto.descripcion),
    levelDescription: text(dto.nivelCualificacion?.descripcion),
    registeredAt: displayDate(dto.fechaRegistro),
    inactiveAt: displayDate(dto.fechaInactivacion),
    traceability: text(dto.trazabilidad),
    previousCode: text(dto.codAnteOcupacionCno),
    functions: dto.funciones.map((row) => item(row.codigo, row.descFuncionCno, isActiveState(row.estado))),
    denominations: dto.denominaciones.map((row) => ({
      ...item(row.codDenominacionCno, row.descDenominacion, isActiveState(row.estado)),
      registeredAt: displayDate(row.fechaReg)
    })),
    skills: dto.habilidades.map((row) => item(row.habilidadDestreza?.codHabDest, row.nombHabDest)),
    knowledge: dto.conocimientos.map((row) => item(row.conocimiento?.codConocimiento, row.nombConocimiento)),
    related: dto.relacionadas.map((row) => ({ code: row.codigoOcupacion, name: row.nombreCnoRelacionada }))
  };
}

/** Lista de opciones de un filtro; si no llega, vacía (el filtro queda solo con «Todos»). */
export function orEmpty<T>(request: Observable<T[] | null | undefined>): Observable<T[]> {
  return request.pipe(
    map((rows) => rows ?? []),
    catchError(() => of([] as T[]))
  );
}

/** Filtros de la consulta como los espera el backend. */
function filterParams(filters: CnoFilters): Record<string, string> {
  return { q: filters.query.trim(), nivel: filters.level, area: filters.area, funcion: filters.function ?? '', estado: filters.status };
}

/** Consulta de ocupaciones de la CNO contra el backend. */
@Injectable({ providedIn: 'root' })
export class CnoService {
  private readonly http = inject(HttpClient);

  /** `GET /api/cno/catalogos/niveles-cualificacion` y `…/areas-desempeno` (los usan Análisis y Correlativa). */
  catalogs(): Observable<CnoCatalogs> {
    const params = queryParams({ page: 1, limit: CATALOG_LIMIT });
    return forkJoin({
      levels: this.http.get<ApiPage<NivelDto>>('/api/cno/catalogos/niveles-cualificacion', { params }),
      areas: this.http.get<ApiPage<AreaDto>>('/api/cno/catalogos/areas-desempeno', { params })
    }).pipe(
      map(({ levels, areas }) => ({
        levels: levels.data.map((item): CatalogOption => ({ id: item.codCualificacion, name: item.nivelesCualificacion, description: text(item.descripcion) })),
        areas: areas.data.map((item): CatalogOption => ({ id: item.codDesempeno, name: item.nomDesempeno, description: text(item.descripcion) }))
      }))
    );
  }

  /**
   * Opciones de la tarjeta «Filtros de búsqueda»: niveles (se muestra el
   * código), áreas y funciones (`GET /api/cno/funciones/opciones`). Si una
   * lista no llega, su filtro queda solo con «Todos» y los demás siguen.
   */
  filterOptions(): Observable<CnoFilterOptions> {
    const catalog = <T>(url: string) => fetchAllPages((page) => this.http.get<ApiPage<T>>(url, { params: queryParams({ page, limit: CATALOG_LIMIT }) }));
    return forkJoin({
      levels: orEmpty(catalog<NivelDto>('/api/cno/catalogos/niveles-cualificacion')),
      areas: orEmpty(catalog<AreaDto>('/api/cno/catalogos/areas-desempeno')),
      functions: orEmpty(this.http.get<FuncionOpcionDto[]>('/api/cno/funciones/opciones'))
    }).pipe(
      map(({ levels, areas, functions }) => ({
        levels: levelOptions(levels),
        areas: areas.map((item) => ({ value: item.nomDesempeno, label: item.nomDesempeno })).sort((a, b) => a.label.localeCompare(b.label, 'es')),
        functions: functions.map((item) => ({ value: item.codigo || item.nombre, label: item.codigo ? `${item.codigo} · ${item.nombre}` : item.nombre }))
      }))
    );
  }

  /** `GET /api/cno/ocupaciones/consulta`: por código o parte del nombre, con filtros, orden y página. */
  search(query: CnoQuery): Observable<CnoPage> {
    const params = queryParams({
      ...filterParams(query),
      page: query.page,
      limit: query.pageSize,
      orden: SORT_PARAM[query.sort],
      direccion: query.ascending ? 'ASC' : 'DESC'
    });
    return this.http
      .get<ApiPage<OcupacionResultadoDto>>('/api/cno/ocupaciones/consulta', { params })
      .pipe(map((page) => ({ items: page.data.map(toRow), total: page.total })));
  }

  /** `GET /api/cno/ocupaciones/:cod`: perfil completo de una ocupación. */
  detail(code: string): Observable<CnoOccupationDetail> {
    return this.http.get<OcupacionDto>(`/api/cno/ocupaciones/${encodeURIComponent(code)}`).pipe(
      map(toDetail),
      catchError((error: unknown) => throwError(() => (isNotFound(error) ? new Error(OCCUPATION_NOT_FOUND) : error)))
    );
  }
}
