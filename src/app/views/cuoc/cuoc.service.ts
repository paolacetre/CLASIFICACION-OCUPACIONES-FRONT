import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, throwError } from 'rxjs';
import { ApiPage, fetchAllPages, isNotFound, queryParams, text } from '../../shared/api/http-helpers';
import { displayDate } from '../../shared/format/date';
import { isActiveState, orEmpty } from '../cno/cno.service';
import {
  CatalogOption,
  CuocCatalogs,
  CuocFilterOptions,
  CuocFilters,
  CuocItem,
  CuocOccupation,
  CuocOccupationDetail,
  CuocPage,
  CuocQuery,
  CuocSortColumn
} from './cuoc.model';

/** La ocupación pedida no existe (404 del servidor). */
export const OCCUPATION_NOT_FOUND = 'OCCUPATION_NOT_FOUND';

/** Las áreas de cualificación son 26: se piden completas en una sola página. */
const CATALOG_LIMIT = 100;

/** Nombre que el backend da a cada columna ordenable (`orden`). */
const SORT_PARAM: Record<CuocSortColumn, string> = { code: 'codigo', name: 'nombre', status: 'estado' };

/* ---------- Formas de las respuestas del backend (back/src/modules/cuoc) ---------- */

interface AreaDto {
  codigo: string;
  descripcion: string;
}

interface NivelDto {
  codNivel: number;
  nombreNivel: string;
  descripcion: string | null;
  esCopia?: boolean;
}

/** Fila de `GET /api/cuoc/ocupaciones/consulta`. */
interface OcupacionResultadoDto {
  codigo: string;
  nombre: string;
  nivelCompetencia?: string | null;
  areaCualificacion?: string | null;
  estado: string;
  /** La consulta todavía no la entrega; se lee por si la agrega. */
  fechaRegistro?: string | null;
  denominaciones: number;
  funciones: number;
  destrezas: number;
  conocimientos: number;
}

/** Componente de una ocupación; según la lista, su texto llega como `nombre` o `descripcion`. */
interface ItemDto {
  codigo: string | number;
  nombre?: string | null;
  descripcion?: string | null;
  /** Funciones y denominaciones: 1/0 (sin valor = activa). */
  estado?: number | boolean | string | null;
  /** Denominaciones. */
  fechaRegistro?: string | null;
}

/** `GET /api/cuoc/ocupaciones/:cod`. */
interface OcupacionDto {
  codOcupacionCuoc: string;
  nomOcupacionCuoc: string;
  descOcupacionCuoc: string | null;
  /** Nombre del área de cualificación. */
  nombre: string | null;
  nombreNivel: string | null;
  fechaRegistro: string | null;
  estado: boolean;
  fechaInactivacion: string | null;
  trazabilidad: string | null;
  codAnteOcupacionCuoc?: string | null;
  grupoPrimario?: { codGrupoPrim: string; nomGrupoPrim: string | null } | null;
  nivelCompetencia: NivelDto | null;
  areaCualificacion: AreaDto | null;
  denominaciones: ItemDto[];
  funciones: ItemDto[];
  conocimientos: ItemDto[];
  /** Destrezas. */
  habilidades: ItemDto[];
  ocupacionesAfines: ItemDto[];
}

/** `GET /api/cuoc/funciones/opciones`. */
interface FuncionOpcionDto {
  codigo: string;
  nombre: string;
}

/** `GET /api/cuoc/ocupaciones/jerarquia`: grandes grupos y grupos primarios para los filtros. */
interface JerarquiaDto {
  granGrupos: { codigo: string; nombre: string }[];
  gruposPrimarios: { codigo: string; nombre: string; granGrupo: string | null }[];
}

function toItem(item: ItemDto): CuocItem {
  return { code: text(item.codigo), text: text(item.nombre ?? item.descripcion), active: isActiveState(item.estado) };
}

function toItems(items: ItemDto[] | null | undefined): CuocItem[] {
  return (items ?? []).map(toItem);
}

/** «2 · DIRECTORES Y GERENTES»: código y nombre de un grupo de la jerarquía. */
const groupLabel = (group: { codigo: string; nombre: string }) => `${group.codigo} · ${group.nombre}`;

/** Nombres sin repetir, en orden (los niveles se repiten con sus copias de Análisis). */
const uniqueSorted = (names: string[]) => [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

function toRow(dto: OcupacionResultadoDto): CuocOccupation {
  return {
    code: dto.codigo,
    name: dto.nombre,
    level: text(dto.nivelCompetencia),
    area: text(dto.areaCualificacion),
    status: dto.estado === 'Inactivo' ? 'Inactivo' : 'Activo',
    registeredAt: displayDate(dto.fechaRegistro),
    denominationsCount: dto.denominaciones,
    functionsCount: dto.funciones,
    skillsCount: dto.destrezas,
    knowledgeCount: dto.conocimientos
  };
}

function toDetail(dto: OcupacionDto): CuocOccupationDetail {
  const functions = toItems(dto.funciones);
  const denominations = (dto.denominaciones ?? []).map((item) => ({ ...toItem(item), registeredAt: displayDate(item.fechaRegistro) }));
  const skills = toItems(dto.habilidades);
  const knowledge = toItems(dto.conocimientos);
  return {
    code: dto.codOcupacionCuoc,
    name: dto.nomOcupacionCuoc,
    level: text(dto.nivelCompetencia?.nombreNivel ?? dto.nombreNivel),
    area: text(dto.areaCualificacion?.descripcion ?? dto.nombre),
    areaCode: text(dto.areaCualificacion?.codigo),
    primaryGroup: [text(dto.grupoPrimario?.codGrupoPrim), text(dto.grupoPrimario?.nomGrupoPrim)].filter(Boolean).join(' · '),
    status: dto.estado ? 'Activo' : 'Inactivo',
    denominationsCount: denominations.length,
    functionsCount: functions.length,
    skillsCount: skills.length,
    knowledgeCount: knowledge.length,
    description: text(dto.descOcupacionCuoc),
    levelDescription: text(dto.nivelCompetencia?.descripcion),
    registeredAt: displayDate(dto.fechaRegistro),
    inactiveAt: displayDate(dto.fechaInactivacion),
    traceability: text(dto.trazabilidad),
    previousCode: text(dto.codAnteOcupacionCuoc),
    functions,
    denominations,
    skills,
    knowledge,
    related: (dto.ocupacionesAfines ?? []).map((item) => ({ code: text(item.codigo), name: text(item.nombre ?? item.descripcion) }))
  };
}

/** Filtros de la consulta como los espera el backend (`granGrupo` y `grupoPrimario` son códigos de la jerarquía). */
function filterParams(filters: CuocFilters): Record<string, string> {
  return {
    q: filters.query.trim(),
    nivel: filters.level ?? '',
    area: filters.area,
    granGrupo: filters.majorGroup ?? '',
    grupoPrimario: filters.primaryGroup ?? '',
    funcion: filters.function ?? '',
    estado: filters.status
  };
}

/** Consulta de ocupaciones de la CUOC contra el backend. */
@Injectable({ providedIn: 'root' })
export class CuocService {
  private readonly http = inject(HttpClient);

  /** `GET /api/cuoc/areas-cualificacion` (paginado) y `GET /api/cuoc/niveles-competencia` (los usan Análisis y Correlativa). */
  catalogs(): Observable<CuocCatalogs> {
    return forkJoin({
      areas: this.http.get<ApiPage<AreaDto>>('/api/cuoc/areas-cualificacion', { params: queryParams({ page: 1, limit: CATALOG_LIMIT }) }),
      levels: this.http.get<NivelDto[]>('/api/cuoc/niveles-competencia')
    }).pipe(
      map(({ areas, levels }) => ({
        areas: areas.data.map((item): CatalogOption => ({ id: item.codigo, name: item.descripcion, description: '' })).sort((a, b) => a.name.localeCompare(b.name, 'es')),
        levels: levels.map((item): CatalogOption => ({ id: String(item.codNivel), name: item.nombreNivel, description: text(item.descripcion) }))
      }))
    );
  }

  /**
   * Opciones de la tarjeta «Filtros de búsqueda», como el front original: nivel
   * de competencia, gran grupo y grupo primario (`GET /api/cuoc/ocupaciones/jerarquia`),
   * área de cualificación y funciones (`GET /api/cuoc/funciones/opciones`). Si
   * una lista no llega, su filtro queda solo con «Todos».
   */
  filterOptions(): Observable<CuocFilterOptions> {
    const hierarchy = this.http
      .get<JerarquiaDto>('/api/cuoc/ocupaciones/jerarquia')
      .pipe(catchError(() => of<JerarquiaDto>({ granGrupos: [], gruposPrimarios: [] })));
    return forkJoin({
      levels: orEmpty(this.http.get<NivelDto[]>('/api/cuoc/niveles-competencia')),
      areas: orEmpty(fetchAllPages((page) => this.http.get<ApiPage<AreaDto>>('/api/cuoc/areas-cualificacion', { params: queryParams({ page, limit: CATALOG_LIMIT }) }))),
      functions: orEmpty(this.http.get<FuncionOpcionDto[]>('/api/cuoc/funciones/opciones')),
      hierarchy
    }).pipe(
      map(({ levels, areas, functions, hierarchy: groups }) => ({
        levels: uniqueSorted(levels.filter((level) => !level.esCopia).map((level) => level.nombreNivel)).map((name) => ({ value: name, label: name })),
        areas: uniqueSorted(areas.map((area) => area.descripcion)).map((name) => ({ value: name, label: name })),
        functions: functions.map((item) => ({ value: item.nombre || item.codigo, label: item.codigo && item.codigo !== item.nombre ? `${item.codigo} · ${item.nombre}` : item.nombre })),
        majorGroups: (groups.granGrupos ?? []).map((group) => ({ value: group.codigo, label: groupLabel(group) })),
        primaryGroups: (groups.gruposPrimarios ?? []).map((group) => ({ value: group.codigo, label: groupLabel(group), parent: group.granGrupo ?? undefined }))
      }))
    );
  }

  /** `GET /api/cuoc/ocupaciones/consulta`: por código o parte del nombre, con filtros, orden y página. */
  search(query: CuocQuery): Observable<CuocPage> {
    const params = queryParams({
      ...filterParams(query),
      page: query.page,
      limit: query.pageSize,
      orden: SORT_PARAM[query.sort],
      direccion: query.ascending ? 'ASC' : 'DESC'
    });
    return this.http
      .get<ApiPage<OcupacionResultadoDto>>('/api/cuoc/ocupaciones/consulta', { params })
      .pipe(map((page) => ({ items: page.data.map(toRow), total: page.total })));
  }

  /** `GET /api/cuoc/ocupaciones/:cod`: perfil completo de una ocupación. */
  detail(code: string): Observable<CuocOccupationDetail> {
    return this.http.get<OcupacionDto>(`/api/cuoc/ocupaciones/${encodeURIComponent(code)}`).pipe(
      map(toDetail),
      catchError((error: unknown) => throwError(() => (isNotFound(error) ? new Error(OCCUPATION_NOT_FOUND) : error)))
    );
  }
}
