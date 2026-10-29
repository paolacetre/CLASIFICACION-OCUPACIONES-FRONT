import { HttpClient, HttpErrorResponse, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, filter, map, throwError } from 'rxjs';
import { text } from '../../shared/api/http-helpers';
import { CnoService } from '../cno/cno.service';
import { CuocService } from '../cuoc/cuoc.service';
import {
  CatalogCriteria,
  CatalogPage,
  CorrelativeItem,
  CorrelativeRelation,
  CorrelativeUploadProgress,
  CorrelativeUploadResult,
  CorrelativeUploadType,
  groupRelations
} from './actualizacion-correlativa.model';

/** La correlativa no se pudo guardar: el servidor la rechazó (lleva su mensaje, p. ej. un código que no existe). */
export const CORRELATIVE_REJECTED = 'CORRELATIVE_REJECTED';
/** El servidor rechazó el archivo (de otro tipo, sin las columnas obligatorias o sin filas válidas). */
export const UPLOAD_REJECTED = 'UPLOAD_REJECTED';

/** Error con un código estable y el mensaje del servidor, que la pantalla muestra tal cual. */
export class CorrelativeError extends Error {
  constructor(code: string, readonly serverMessage: string) {
    super(code);
  }
}

/** Fila de `GET /api/correlativa/ocupaciones`. */
interface CorrelativaOcupacionDto {
  codigo: number;
  codOcupacionCno: string;
  nombOcupacionCno: string | null;
  codOcupacionCuoc: string;
  nombOcupacionCuoc: string | null;
  observacion?: string | null;
}

/** Respuesta de `POST /api/correlativa/upload/:tipo`. */
interface CargaDto {
  message: string;
  totalInserted: number;
  totalSkipped: number;
  sheets: Array<{ errors?: string[]; skippedDetails?: string[]; warnings?: string[] }>;
}

/** El filtro de errores del backend anida el mensaje: `{ message: { message } }`, a veces como lista. */
function serverMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return '';
  }
  const body = error.error as { message?: unknown } | null;
  const nested = (body?.message as { message?: unknown } | undefined)?.message ?? body?.message;
  return Array.isArray(nested) ? nested.join(' ') : typeof nested === 'string' ? nested : '';
}

function toResult(dto: CargaDto): CorrelativeUploadResult {
  const sheets = dto.sheets ?? [];
  return {
    message: text(dto.message),
    inserted: dto.totalInserted ?? 0,
    skipped: dto.totalSkipped ?? 0,
    errors: sheets.flatMap((sheet) => sheet.errors ?? []),
    skippedDetails: sheets.flatMap((sheet) => sheet.skippedDetails ?? []),
    warnings: sheets.flatMap((sheet) => sheet.warnings ?? [])
  };
}

/**
 * Actualización de la correlativa CNO ↔ CUOC contra el backend (`/api/correlativa`), como la
 * pantalla «Correlación» del front original: las relaciones se leen y guardan a nivel de
 * ocupación y los paneles consultan los catálogos con los mismos servicios de Consulta.
 */
@Injectable({ providedIn: 'root' })
export class ActualizacionCorrelativaService {
  private readonly http = inject(HttpClient);
  private readonly cnoService = inject(CnoService);
  private readonly cuocService = inject(CuocService);

  /** `GET /api/cno/ocupaciones/consulta`, en orden de código. */
  searchCno(criteria: CatalogCriteria): Observable<CatalogPage> {
    return this.cnoService
      .search({ query: criteria.query, level: '', area: criteria.area, status: criteria.status, page: criteria.page, pageSize: criteria.pageSize, sort: 'code', ascending: true })
      .pipe(map((page) => ({ items: page.items.map(({ code, name }) => ({ code, name })), total: page.total })));
  }

  /** `GET /api/cuoc/ocupaciones/consulta`, en orden de código. */
  searchCuoc(criteria: CatalogCriteria): Observable<CatalogPage> {
    return this.cuocService
      .search({ query: criteria.query, area: criteria.area, status: criteria.status, page: criteria.page, pageSize: criteria.pageSize, sort: 'code', ascending: true })
      .pipe(map((page) => ({ items: page.items.map(({ code, name }) => ({ code, name })), total: page.total })));
  }

  /** Nombres de las áreas de desempeño CNO (el backend filtra por nombre). */
  cnoAreas(): Observable<string[]> {
    return this.cnoService.catalogs().pipe(map((catalogs) => uniqueNames(catalogs.areas.map((area) => area.name))));
  }

  /** Nombres de las áreas de cualificación CUOC (el backend filtra por nombre). */
  cuocAreas(): Observable<string[]> {
    return this.cuocService.catalogs().pipe(map((catalogs) => uniqueNames(catalogs.areas.map((area) => area.name))));
  }

  /** `GET /api/correlativa/ocupaciones`: todas las filas CNO-CUOC, agrupadas por ocupación CNO. */
  relations(): Observable<CorrelativeRelation[]> {
    return this.http.get<CorrelativaOcupacionDto[]>('/api/correlativa/ocupaciones').pipe(
      map((rows) =>
        groupRelations(
          (rows ?? []).map((row) => ({
            cnoCode: row.codOcupacionCno,
            cnoName: text(row.nombOcupacionCno),
            cuocCode: row.codOcupacionCuoc,
            cuocName: text(row.nombOcupacionCuoc),
            observation: text(row.observacion)
          }))
        )
      )
    );
  }

  /**
   * `POST /api/correlativa/ocupaciones`: guarda la correlativa de una ocupación CNO. El backend
   * reemplaza las filas que esa CNO tuviera (también su observación), así que sirve igual para
   * crear que para editar; por eso la observación que ya tenía se reenvía.
   */
  save(cno: CorrelativeItem, cuoc: CorrelativeItem[], observation = ''): Observable<void> {
    return defer(() => {
      return this.http.post('/api/correlativa/ocupaciones', {
        codOcupacionCno: cno.code,
        nombOcupacionCno: cno.name,
        cuoc: cuoc.map((item) => ({ codigo: item.code, nombre: item.name })),
        ...(observation ? { observacion: observation } : {})
      });
    }).pipe(
      map(() => undefined),
      catchError((error: unknown) =>
        throwError(() => (error instanceof HttpErrorResponse && error.status === 400 ? new CorrelativeError(CORRELATIVE_REJECTED, serverMessage(error)) : error))
      )
    );
  }

  /**
   * `POST /api/correlativa/upload/:tipo` con avance. El servidor valida el archivo contra ese tipo
   * y, si sirve, REEMPLAZA toda la tabla de ese tipo; si no sirve no toca nada (400 con el motivo).
   */
  upload(type: CorrelativeUploadType, file: File): Observable<CorrelativeUploadProgress> {
    return defer(() => {
      const form = new FormData();
      form.append('file', file);
      return this.http.post<CargaDto>(`/api/correlativa/upload/${type}`, form, { observe: 'events', reportProgress: true });
    }).pipe(
      filter((event: HttpEvent<CargaDto>) => event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response),
      map((event): CorrelativeUploadProgress => {
        if (event.type === HttpEventType.Response) {
          return { progress: 100, messageKey: 'actualizacionCorrelativa.progressDone', done: true, result: toResult(event.body as CargaDto) };
        }
        const sent = event.type === HttpEventType.UploadProgress && event.total ? event.loaded / event.total : 0;
        return sent < 1
          ? { progress: Math.round(sent * 90), messageKey: 'actualizacionCorrelativa.progressUploading', done: false }
          : { progress: 90, messageKey: 'actualizacionCorrelativa.progressProcessing', done: false };
      }),
      catchError((error: unknown) =>
        throwError(() => (error instanceof HttpErrorResponse && error.status === 400 ? new CorrelativeError(UPLOAD_REJECTED, serverMessage(error)) : error))
      )
    );
  }

  /**
   * Plantilla del tipo. Se pide al servidor (`GET /api/correlativa/upload/plantilla/:tipo`, como la
   * versión desplegada); si no la tiene (la copia local responde 404), se usa la que trae el front
   * en `assets/plantillas/correlativa/`.
   */
  template(type: CorrelativeUploadType): Observable<Blob> {
    return this.http
      .get(`/api/correlativa/upload/plantilla/${type}`, { responseType: 'blob' })
      .pipe(catchError(() => this.http.get(`assets/plantillas/correlativa/Plantilla_Correlativa_${type}.xlsx`, { responseType: 'blob' })));
  }
}

function uniqueNames(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}
