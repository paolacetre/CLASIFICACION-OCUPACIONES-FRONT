import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, map, of, tap, throwError } from 'rxjs';
import { text } from '../../shared/api/http-helpers';
import { ComparativaService, InstrumentoDto, toListedOccupation, toOccupation } from '../comparativa/comparativa.service';
import { Expert, ExpertSelection, Instrument2Detail, Instrument2Item, VISIBLE_STATES } from './instrumento-2.model';

/** El instrumento pedido no existe (el 404 del servidor). */
export const INSTRUMENT_NOT_FOUND = 'INSTRUMENT_NOT_FOUND';
/** No está GUARDADO: ya se envió, o volvió a edición en Comparativa (el 409 del servidor). */
export const INSTRUMENT_NOT_READY = 'INSTRUMENT_NOT_READY';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Fecha y hora ISO → '06 oct 2026' y '11:50 a. m.' del día local; vacíos si no hay fecha. */
function toDayAndTime(value: string | null | undefined): { day: string; time: string } {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { day: '', time: '' };
  }
  const hours = date.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return {
    day: `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
    time: `${String(hour12).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'a. m.' : 'p. m.'}`
  };
}

function toItem(dto: InstrumentoDto): Instrument2Item {
  // Un instrumento antiguo puede no traer el resumen: se muestra su ocupación principal.
  const summary = dto.ocupaciones?.length
    ? dto.ocupaciones
    : [{ codigo: dto.ocupacion, codigoOriginal: dto.codigoOriginal, nombre: text(dto.nombre), panelOrigen: dto.panelOrigen, nivelCualificacion: dto.nivelCualificacion, areaDesempeno: dto.areaDesempeno }];
  return { id: dto.id, state: dto.estado, occupations: summary.map(toListedOccupation), analyst: text(dto.analista), ...toDayAndTime(dto.fecha) };
}

/** Fila de `GET /api/instrumento2/expertos-disponibles` (solo usuarios activos con rol Experto). */
interface ExpertoDto {
  idUsuario: number;
  nombre?: string | null;
  correo?: string | null;
}

/** Traduce la respuesta de error del backend a un código estable. */
function toInstrumentError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  return error.status === 404 ? new Error(INSTRUMENT_NOT_FOUND) : error.status === 409 ? new Error(INSTRUMENT_NOT_READY) : error;
}

/**
 * Bandeja de Instrumento 2, contra el backend (`/api/instrumento2`, el mismo
 * recurso que usa Comparativa). Esta vista no edita: muestra lo que ya se
 * envió desde Análisis o Comparativa y lo envía a validación experta.
 */
@Injectable({ providedIn: 'root' })
export class Instrumento2Service {
  private readonly http = inject(HttpClient);
  private readonly comparativaService = inject(ComparativaService);

  /** `GET /api/instrumento2`: lo que ya está en Instrumento 2 (sin los borradores que siguen en Comparativa), lo más reciente primero. */
  list(): Observable<Instrument2Item[]> {
    return this.http.get<InstrumentoDto[]>('/api/instrumento2').pipe(
      map((rows) =>
        rows
          .filter((row) => VISIBLE_STATES.includes(row.estado))
          .map(toItem)
          .sort((a, b) => b.id - a.id)
      )
    );
  }

  /** `GET /api/instrumento2/:id/comparacion`: el instrumento con sus ocupaciones completas. */
  detail(id: number): Observable<Instrument2Detail> {
    return this.http.get<InstrumentoDto[]>(`/api/instrumento2/${id}/comparacion`).pipe(
      catchError((error: unknown) => throwError(() => toInstrumentError(error))),
      map((occupations) => {
        if (!occupations.length) {
          throw new Error(INSTRUMENT_NOT_FOUND);
        }
        const [main] = occupations;
        return {
          id: main.id,
          state: main.estado,
          occupations: occupations.map(toOccupation),
          analyst: text(main.analista),
          ...toDayAndTime(main.fecha),
          observation: text(main.observacion)
        };
      })
    );
  }

  /**
   * `GET /api/instrumento2/expertos-disponibles`: los expertos a los que se puede enviar (contrato de la versión
   * desplegada). `null` si el servidor todavía no permite elegir ocupaciones ni expertos: la copia local del
   * backend no tiene esa ruta y la toma como `/:id` (400), o responde 404/405; entonces se envía como antes, todo.
   */
  experts(): Observable<Expert[] | null> {
    return this.http.get<ExpertoDto[]>('/api/instrumento2/expertos-disponibles').pipe(
      map((rows) => rows.map((row) => ({ id: row.idUsuario, name: text(row.nombre) || text(row.correo), email: text(row.correo) }))),
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && [400, 404, 405].includes(error.status) ? of(null) : throwError(() => error)
      )
    );
  }

  /**
   * `POST /api/instrumento2/:id/enviar-experto`: lo deja en manos del experto
   * (ENVIADO_EXPERTO). Desde ese momento ya no admite cambios en Comparativa.
   * Con `selection` viaja `{ ocupaciones, expertos }` (solo las ocupaciones marcadas, a los expertos elegidos,
   * como la versión desplegada); sin ella, sin cuerpo (el servidor envía la comparativa completa).
   */
  sendToExpert(id: number, selection?: ExpertSelection): Observable<Instrument2Item> {
    const body = selection ? { ocupaciones: selection.occupations, expertos: selection.experts } : null;
    return defer(() => {
      return this.http.post<InstrumentoDto>(`/api/instrumento2/${id}/enviar-experto`, body);
    }).pipe(
      catchError((error: unknown) => throwError(() => toInstrumentError(error))),
      // Comparativa lee el mismo recurso: su lista guardada quedó desactualizada.
      tap(() => this.comparativaService.invalidate()),
      map(toItem)
    );
  }
}
