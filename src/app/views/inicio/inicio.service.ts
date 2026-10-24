import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { ApiPage, queryParams, text } from '../../shared/api/http-helpers';
import { ActivityEntry, Indicator, createIndicators } from './inicio.model';

/** Fila de `GET /api/bitacora`. */
interface BitacoraDto {
  id: number;
  tipo: string;
  titulo: string;
  detalle: string | null;
  fecha: string;
}

/** Resumen de Inicio contra el backend. */
@Injectable({ providedIn: 'root' })
export class InicioService {
  private readonly http = inject(HttpClient);

  /**
   * Totales de las tarjetas. No hay un endpoint de resumen: cada total sale del
   * `total` de la lista paginada de su módulo (pidiendo una sola fila) o del
   * largo de la lista de instrumentos. Si una consulta falla, ese indicador
   * queda sin valor y los demás se muestran.
   */
  listIndicators(): Observable<Indicator[]> {
    const one = queryParams({ page: 1, limit: 1 });
    const total = (url: string) =>
      this.http.get<ApiPage<unknown>>(url, { params: one }).pipe(
        map((page) => page.total),
        catchError(() => of(null))
      );
    const count = (url: string) =>
      this.http.get<unknown[]>(url).pipe(
        map((list) => list.length),
        catchError(() => of(null))
      );
    return forkJoin({
      cno: total('/api/cno/ocupaciones'),
      cuoc: total('/api/cuoc/ocupaciones'),
      correlativa: total('/api/correlativa'),
      instrumento2: count('/api/instrumento2'),
      instrumento3: count('/api/instrumento3')
    }).pipe(
      map((totals) => {
        const instrumentos = totals.instrumento2 === null && totals.instrumento3 === null ? null : (totals.instrumento2 ?? 0) + (totals.instrumento3 ?? 0);
        const values = { cno: totals.cno, cuoc: totals.cuoc, correlativa: totals.correlativa, instrumentos };
        return createIndicators().map((indicator) => ({ ...indicator, value: values[indicator.id] }));
      })
    );
  }

  /** `GET /api/bitacora`: lo último que hizo quien tiene la sesión, de lo más reciente a lo más antiguo. */
  listActivity(): Observable<ActivityEntry[]> {
    return this.http
      .get<BitacoraDto[]>('/api/bitacora')
      .pipe(map((rows) => rows.map((row) => ({ id: row.id, type: row.tipo, title: row.titulo, detail: text(row.detalle), date: row.fecha }))));
  }
}
