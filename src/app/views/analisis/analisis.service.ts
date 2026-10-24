import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { ApiPage, queryParams, text } from '../../shared/api/http-helpers';
import { CnoOccupationDetail } from '../cno/cno.model';
import { CnoService } from '../cno/cno.service';
import { Comparison } from '../comparativa/comparativa.model';
import { ComparativaService } from '../comparativa/comparativa.service';
import { CuocOccupationDetail } from '../cuoc/cuoc.model';
import { CuocService } from '../cuoc/cuoc.service';
import {
  AnalysisCatalog,
  AnalysisExport,
  AnalysisItem,
  AnalysisLevel,
  AnalysisLevelDraft,
  AnalysisOccupation,
  AnalysisOptions,
  AnalysisSearchResult,
  LEVEL_DESCRIPTION_MAX,
  MAX_OCCUPATIONS,
  MIN_OCCUPATIONS,
  levelText,
  missingFields
} from './analisis.model';

/** El análisis no tiene entre 2 y 3 ocupaciones. */
export const INVALID_OCCUPATION_COUNT = 'INVALID_OCCUPATION_COUNT';
/** A alguna ocupación le falta un campo obligatorio. */
export const MISSING_REQUIRED_FIELDS = 'MISSING_REQUIRED_FIELDS';
/** El servidor no aceptó el análisis (p. ej. ningún código corresponde a una ocupación del catálogo). */
export const ANALYSIS_REJECTED = 'ANALYSIS_REJECTED';
/** El análisis quedó guardado en Comparativa, pero no se pudo dejar en Instrumento 2. */
export const SAVED_NOT_SENT = 'SAVED_NOT_SENT';

/** Al nivel le falta el nombre o su descripción es demasiado larga. */
export const INVALID_LEVEL = 'INVALID_LEVEL';
/** Ya hay un nivel con ese nombre en el catálogo o entre los creados para Análisis (el 409 del servidor). */
export const LEVEL_NAME_TAKEN = 'LEVEL_NAME_TAKEN';

/** Máximo de ocupaciones que devuelve el buscador. */
const SEARCH_LIMIT = 8;
/** Los niveles de un catálogo caben en una página. */
const LEVEL_LIMIT = 100;

/** Nivel de la CNO (`/api/cno/catalogos/niveles-cualificacion`). */
interface CnoNivelDto {
  codCualificacion: string;
  nivelesCualificacion: string;
  descripcion?: string | null;
}

/** Nivel de la CUOC (`/api/cuoc/niveles-competencia`). */
interface CuocNivelDto {
  codNivel: number;
  nombreNivel: string;
  descripcion?: string | null;
}

/** Una ocupación del análisis tal como la recibe `POST /api/analisis/guardar`. */
interface PanelDto {
  codigo: string;
  nombre: string;
  descripcion: string;
  /** Nombre del nivel y del área (el backend los busca por nombre). */
  nivelCualificacion: string;
  areaDesempeno: string;
  estado: string;
  trazabilidad: string;
  funciones: { codigo: string; descripcion: string }[];
  denominaciones: { codigo: string; nombre: string }[];
  habilidades: { codigo: string; nombre: string }[];
  conocimientos: { codigo: string; nombre: string }[];
  ocupacionesRelacionadas: { codigo: string; nombre: string }[];
}

/** Respuesta de `POST /api/analisis/guardar`. */
interface GuardarAnalisisDto {
  /** Id del instrumento 2 que se creó: es el id de la comparativa. */
  instrumentoId: number;
}

function named(items: AnalysisItem[]): { codigo: string; nombre: string }[] {
  return items.map((item) => ({ codigo: item.code, nombre: item.text }));
}

/** Las fechas no viajan: la copia que crea el backend conserva las de la ocupación original. */
function toPanel(occupation: AnalysisOccupation): PanelDto {
  return {
    codigo: occupation.code,
    nombre: occupation.name.trim(),
    descripcion: occupation.description.trim(),
    nivelCualificacion: occupation.level,
    areaDesempeno: occupation.area,
    estado: occupation.status,
    trazabilidad: occupation.traceability.trim(),
    funciones: occupation.functions.map((item) => ({ codigo: item.code, descripcion: item.text })),
    denominaciones: named(occupation.denominations),
    habilidades: named(occupation.skills),
    conocimientos: named(occupation.knowledge),
    ocupacionesRelacionadas: named(occupation.related)
  };
}

/**
 * Análisis de ocupaciones, contra el backend. Las ocupaciones salen de los
 * catálogos CNO y CUOC (por sus servicios); el catálogo nunca se modifica:
 * al guardar, el backend crea una copia de cada ocupación con lo que se editó
 * y una comparativa (un "instrumento 2") que queda en Comparativa.
 */
@Injectable({ providedIn: 'root' })
export class AnalisisService {
  private readonly http = inject(HttpClient);
  private readonly cnoService = inject(CnoService);
  private readonly cuocService = inject(CuocService);
  private readonly comparativaService = inject(ComparativaService);

  /**
   * Niveles de cualificación (los del catálogo y, con `incluirCopias=true`, los
   * creados para Análisis) y áreas de desempeño para editar la copia.
   */
  options(catalog: AnalysisCatalog): Observable<AnalysisOptions> {
    const levels: Observable<{ names: string[]; labels: Record<string, string> }> =
      catalog === 'CNO'
        ? this.http
            .get<ApiPage<CnoNivelDto>>('/api/cno/catalogos/niveles-cualificacion', { params: queryParams({ page: 1, limit: LEVEL_LIMIT, incluirCopias: true }) })
            .pipe(
              map((page) => ({
                names: page.data.map((item) => text(item.nivelesCualificacion)),
                // El backend resuelve el nivel por su nombre; en pantalla se muestra completo, con su código.
                labels: Object.fromEntries(
                  page.data.map((item) => [text(item.nivelesCualificacion), levelText({ level: text(item.nivelesCualificacion), levelCode: text(item.codCualificacion) })])
                )
              }))
            )
        : this.http
            .get<CuocNivelDto[]>('/api/cuoc/niveles-competencia', { params: queryParams({ incluirCopias: true }) })
            .pipe(map((list) => ({ names: list.map((item) => text(item.nombreNivel)), labels: {} })));
    const areas = (catalog === 'CNO' ? this.cnoService.catalogs() : this.cuocService.catalogs()).pipe(map((catalogs) => catalogs.areas.map((area) => area.name)));
    return forkJoin({ levels, areas }).pipe(map(({ levels: found, areas: names }) => ({ levels: found.names, levelLabels: found.labels, areas: names })));
  }

  /**
   * `POST /api/cno/catalogos/niveles-cualificacion/copias` o
   * `POST /api/cuoc/niveles-competencia/copias`: crea un nivel que solo se usa
   * en Análisis (no entra al catálogo oficial). El servidor le asigna el código
   * y exige un nombre distinto de los niveles existentes.
   */
  createLevel(catalog: AnalysisCatalog, draft: AnalysisLevelDraft): Observable<AnalysisLevel> {
    return defer(() => {
      const body = { nombre: draft.name.trim(), descripcion: draft.description.trim() };
      if (!body.nombre || body.descripcion.length > LEVEL_DESCRIPTION_MAX) {
        throw new Error(INVALID_LEVEL);
      }
      const created: Observable<{ code: string; name: string; description: string }> =
        catalog === 'CNO'
          ? this.http
              .post<CnoNivelDto>('/api/cno/catalogos/niveles-cualificacion/copias', body)
              .pipe(map((level) => ({ code: text(level.codCualificacion), name: text(level.nivelesCualificacion), description: text(level.descripcion) })))
          : this.http
              .post<CuocNivelDto>('/api/cuoc/niveles-competencia/copias', body)
              .pipe(map((level) => ({ code: String(level.codNivel), name: text(level.nombreNivel), description: text(level.descripcion) })));
      return created.pipe(
        map((level) => ({ ...level, catalog })),
        catchError((error: unknown) => {
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          return throwError(() => (status === 409 ? new Error(LEVEL_NAME_TAKEN) : status === 400 ? new Error(INVALID_LEVEL) : error));
        })
      );
    });
  }

  /** Ocupaciones del catálogo por código o parte del nombre. */
  search(catalog: AnalysisCatalog, query: string): Observable<AnalysisSearchResult[]> {
    const page = { page: 1, pageSize: SEARCH_LIMIT, sort: 'code', ascending: true } as const;
    const results: Observable<{ items: { code: string; name: string }[] }> =
      catalog === 'CNO' ? this.cnoService.search({ query, level: '', area: '', status: '', ...page }) : this.cuocService.search({ query, area: '', status: '', ...page });
    return results.pipe(map(({ items }) => items.map(({ code, name }) => ({ catalog, code, name }))));
  }

  /** La ocupación completa del catálogo, lista para agregarla al análisis. */
  occupation(catalog: AnalysisCatalog, code: string): Observable<AnalysisOccupation> {
    const detail: Observable<CnoOccupationDetail | CuocOccupationDetail> = catalog === 'CNO' ? this.cnoService.detail(code) : this.cuocService.detail(code);
    return detail.pipe(
      map((item) => ({
        catalog,
        code: item.code,
        status: item.status,
        name: item.name,
        level: item.level,
        levelCode: 'levelCode' in item ? item.levelCode : undefined,
        area: item.area,
        description: item.description,
        // Los componentes conservan el código con el que vienen del catálogo.
        functions: item.functions,
        skills: item.skills,
        knowledge: item.knowledge,
        denominations: item.denominations,
        related: item.related.map(({ code, name }) => ({ code, text: name })),
        registeredAt: item.registeredAt,
        traceability: item.traceability
      }))
    );
  }

  /** `POST /api/analisis/guardar`: guarda las copias editadas; quedan en Comparativa como una comparativa "Recibido". */
  save(occupations: AnalysisOccupation[]): Observable<Comparison> {
    return this.store(occupations).pipe(switchMap((id) => this.comparativaService.get(id)));
  }

  /**
   * Guarda igual que `save()` y además deja la comparativa "En Instrumento 2"
   * (`POST /api/instrumento2/:id/guardar`). Si ese segundo paso falla, el
   * análisis ya quedó en Comparativa: responde `SAVED_NOT_SENT`.
   */
  sendToInstrument2(occupations: AnalysisOccupation[]): Observable<Comparison> {
    return this.store(occupations).pipe(
      switchMap((id) => this.comparativaService.sendToInstrument2(id).pipe(catchError(() => throwError(() => new Error(SAVED_NOT_SENT)))))
    );
  }

  /**
   * Las ocupaciones del análisis tal como están en pantalla, en un CSV que
   * Excel abre. Se arma en el navegador: el backend no tiene un servicio de
   * exportación para Análisis.
   */
  export(occupations: AnalysisOccupation[]): Observable<AnalysisExport> {
    return defer(() => {
      const texts = (items: AnalysisItem[]) => items.map((item) => `${item.code} ${item.text}`).join(' | ');
      const rows = [
        ['Catálogo', 'Código', 'Ocupación', 'Nivel de cualificación', 'Área de desempeño', 'Descripción', 'Funciones', 'Habilidades', 'Conocimientos', 'Denominaciones'],
        ...occupations.map((item) => [
          item.catalog,
          item.code,
          item.name,
          item.level,
          item.area,
          item.description,
          texts(item.functions),
          texts(item.skills),
          texts(item.knowledge),
          texts(item.denominations)
        ])
      ];
      const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\r\n');
      // El BOM hace que Excel lea las tildes como UTF-8.
      return of({ blob: new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8' }), fileName: 'analisis-ocupaciones.csv' });
    });
  }

  /**
   * Guarda el análisis y devuelve el id de la comparativa creada. Los tres
   * espacios del backend (`cno`, `cuoc`, `relacion`) son solo posiciones:
   * cada uno acepta una ocupación de cualquiera de los dos catálogos. La
   * primera ocupación es la que queda como principal de la comparativa.
   */
  private store(occupations: AnalysisOccupation[]): Observable<number> {
    return defer(() => {
      if (occupations.length < MIN_OCCUPATIONS || occupations.length > MAX_OCCUPATIONS) {
        throw new Error(INVALID_OCCUPATION_COUNT);
      }
      if (occupations.some((item) => missingFields(item).length)) {
        throw new Error(MISSING_REQUIRED_FIELDS);
      }
      const [first, second, third] = occupations.map(toPanel);
      return this.http.post<GuardarAnalisisDto>('/api/analisis/guardar', { cno: first, cuoc: second, relacion: third ?? null, panelSeleccionado: 'left' });
    }).pipe(
      catchError((error: unknown) => throwError(() => (error instanceof HttpErrorResponse && error.status === 400 ? new Error(ANALYSIS_REJECTED) : error))),
      tap(() => this.comparativaService.invalidate()),
      map((saved) => saved.instrumentoId)
    );
  }
}
