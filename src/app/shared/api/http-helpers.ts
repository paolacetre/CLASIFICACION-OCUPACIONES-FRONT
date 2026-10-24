import { HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { EMPTY, Observable, expand, reduce } from 'rxjs';

/** Lista paginada, como la entrega el backend (`buildPageResponse`). */
export interface ApiPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Trae TODAS las filas de un catálogo paginado pidiendo página tras página hasta `totalPages` (sin tope fijo). */
export function fetchAllPages<T>(fetchPage: (page: number) => Observable<ApiPage<T>>): Observable<T[]> {
  return fetchPage(1).pipe(
    expand((current) => (current.page < current.totalPages ? fetchPage(current.page + 1) : EMPTY)),
    reduce((rows, current) => rows.concat(current.data), [] as T[])
  );
}

/** Parámetros de consulta sin los valores vacíos: el backend rechaza propiedades que no espera y trata '' como filtro. */
export function queryParams(values: Record<string, string | number | boolean | null | undefined>): HttpParams {
  let params = new HttpParams();
  for (const [name, value] of Object.entries(values)) {
    if (value !== '' && value !== null && value !== undefined) {
      params = params.set(name, String(value));
    }
  }
  return params;
}

/** Texto de un campo que puede venir `null` del backend ('' = sin dato). */
export function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Nombre del archivo que propone el backend en `Content-Disposition`, o el de respaldo. */
export function downloadName(response: HttpResponse<Blob>, fallback: string): string {
  const header = response.headers.get('Content-Disposition') ?? '';
  return /filename="?([^";]+)"?/.exec(header)?.[1] ?? fallback;
}

/** El backend respondió 404 (el recurso no existe). */
export function isNotFound(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 404;
}
