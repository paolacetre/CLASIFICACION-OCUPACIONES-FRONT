import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, shareReplay, switchMap } from 'rxjs';
import { ApiPage, downloadName, queryParams, text } from '../../shared/api/http-helpers';
import {
  CorrelationRow,
  CorrelativaExport,
  CorrelativaKind,
  CorrelativaPage,
  CorrelativaQuery,
  DenominationCorrelation,
  KnowledgeCorrelation,
  OccupationCorrelation
} from './correlativa.model';
import { filterRows, pageOf, toCsv } from './correlativa.rows';

/** Filas por petición al traer las correlativas por denominación (el máximo que admite el backend). */
const CHUNK_SIZE = 500;

/* ---------- Formas de las respuestas del backend (back/src/modules/correlativa) ---------- */

/** Fila de `GET /api/correlativa` (por denominación). */
interface CorrelativaDto {
  codigo: number;
  codOcupacionCno: string;
  codDenominacionCno: string;
  descDenominacionCno: string;
  codOcupacionCuoc: string;
  codDenominacionCuoc?: string | null;
  descDenominacionCuoc: string;
  estado: boolean | null;
  observacion: string | null;
}

/** Fila de `GET /api/correlativa/ocupaciones`. */
interface CorrelativaOcupacionDto {
  codigo: number;
  codOcupacionCno: string;
  nombOcupacionCno: string | null;
  codOcupacionCuoc: string;
  nombOcupacionCuoc: string | null;
}

/** Fila de `GET /api/correlativa/conocimientos`. */
interface CorrelativaConocimientoDto {
  codigo?: number;
  codConocimiento?: number;
  codConocimientoCno: number;
  nombConocimientoCno: string;
  codConocimientoCuoc: number;
  nombConocimientoCuoc: string;
  aplica?: number | boolean | null;
  aplicaCorrelConocimientos?: number | boolean | null;
}

function toDenomination(dto: CorrelativaDto): DenominationCorrelation {
  return {
    id: dto.codigo,
    cnoOccupationCode: dto.codOcupacionCno,
    cnoDenominationCode: dto.codDenominacionCno,
    denominationDescription: text(dto.descDenominacionCno),
    cuocOccupationCode: dto.codOcupacionCuoc,
    cuocDenominationCode: text(dto.codDenominacionCuoc),
    description: text(dto.descDenominacionCuoc),
    // Solo `false` marca la correlación como inactiva; sin dato cuenta como activa.
    status: dto.estado === false ? 'Inactivo' : 'Activo',
    observation: text(dto.observacion)
  };
}

function toOccupation(dto: CorrelativaOcupacionDto): OccupationCorrelation {
  return {
    id: dto.codigo,
    cnoOccupationCode: dto.codOcupacionCno,
    name: text(dto.nombOcupacionCno),
    cuocOccupationCode: dto.codOcupacionCuoc,
    cuocName: text(dto.nombOcupacionCuoc)
  };
}

function toKnowledge(dto: CorrelativaConocimientoDto, index: number): KnowledgeCorrelation {
  const applied = dto.aplicaCorrelConocimientos ?? dto.aplica;
  return {
    id: dto.codigo ?? dto.codConocimiento ?? index + 1,
    cnoKnowledgeCode: text(dto.codConocimientoCno),
    cnoKnowledgeName: text(dto.nombConocimientoCno),
    cuocKnowledgeCode: text(dto.codConocimientoCuoc),
    cuocKnowledgeName: text(dto.nombConocimientoCuoc),
    applied: applied === true || applied === 1
  };
}

/**
 * Correlativa CNO ↔ CUOC (solo consulta) contra el backend. El backend entrega
 * cada tabla completa y no busca por texto, así que las filas se traen una vez
 * por pestaña (se conservan mientras dure la sesión de la página) y la
 * búsqueda, los filtros y la paginación se resuelven en el navegador.
 */
@Injectable({ providedIn: 'root' })
export class CorrelativaService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<CorrelativaKind, Observable<CorrelationRow[]>>();

  /** Una página de la pestaña y el total de registros que cumplen la consulta. */
  search(kind: CorrelativaKind, query: CorrelativaQuery): Observable<CorrelativaPage> {
    return this.rows(kind).pipe(map((rows) => pageOf(kind, rows, query)));
  }

  /** "Descargar consultadas": todos los registros de la consulta (no solo la página), en un CSV que Excel abre. */
  export(kind: CorrelativaKind, query: CorrelativaQuery): Observable<CorrelativaExport> {
    return this.rows(kind).pipe(map((rows) => ({ blob: toCsv([[kind, filterRows(kind, rows, query)]]), fileName: `correlativa-${kind}.csv` })));
  }

  /** `GET /api/correlativa/exportar-excel`: el Excel completo de la correlativa que arma el servidor. */
  exportAll(): Observable<CorrelativaExport> {
    return this.http
      .get('/api/correlativa/exportar-excel', { responseType: 'blob', observe: 'response' })
      .pipe(map((response) => ({ blob: response.body!, fileName: downloadName(response, 'Correlativa_CNO_CUOC_Completo.xlsx') })));
  }

  /** Filas de una pestaña: se piden la primera vez y se reutilizan después. Si la carga falla, la siguiente consulta lo intenta de nuevo. */
  private rows(kind: CorrelativaKind): Observable<CorrelationRow[]> {
    let rows = this.cache.get(kind);
    if (!rows) {
      rows = this.load(kind).pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.cache.set(kind, rows);
      rows.subscribe({ error: () => this.cache.delete(kind) });
    }
    return rows;
  }

  /** Pide al backend la tabla completa de la pestaña. */
  private load(kind: CorrelativaKind): Observable<CorrelationRow[]> {
    switch (kind) {
      case 'denominacion':
        return this.loadDenominations();
      case 'ocupacion':
        return this.http.get<CorrelativaOcupacionDto[]>('/api/correlativa/ocupaciones').pipe(map((rows) => rows.map(toOccupation)));
      case 'conocimiento':
        return this.http.get<CorrelativaConocimientoDto[]>('/api/correlativa/conocimientos').pipe(map((rows) => rows.map(toKnowledge)));
    }
  }

  /** `GET /api/correlativa?page=&limit=`: son miles de filas, así que se traen de a 500; la primera página dice cuántas faltan. */
  private loadDenominations(): Observable<CorrelationRow[]> {
    const page = (number: number) => this.http.get<ApiPage<CorrelativaDto>>('/api/correlativa', { params: queryParams({ page: number, limit: CHUNK_SIZE }) });
    return page(1).pipe(
      switchMap((first) => {
        const rest = Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) => page(index + 2));
        return rest.length ? forkJoin(rest).pipe(map((pages) => [first, ...pages])) : of([first]);
      }),
      map((pages) => pages.flatMap((item) => item.data).map(toDenomination))
    );
  }
}
