import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

/**
 * Comprueba si la API responde, para "Acerca de" en Configuración. Pide
 * `GET /auth/me`, que es liviano y existe en el backend; la pestaña solo se ve
 * con sesión iniciada, así que el interceptor agrega el token.
 *
 * Cualquier respuesta del servidor (también un 401 o un 403) cuenta como "en
 * línea": lo que se quiere saber es si la API contesta. Sin respuesta (estado 0)
 * o con un 5xx —lo que entrega el proxy de `ng serve` cuando el backend está
 * apagado— cuenta como "sin conexión".
 */
@Injectable({ providedIn: 'root' })
export class ApiStatusService {
  private readonly http = inject(HttpClient);

  /** `true` si la API respondió. Nunca falla: un error se traduce en `false`. */
  check(): Observable<boolean> {
    return this.http.get('/auth/me').pipe(
      map(() => true),
      catchError((error: unknown) => of(error instanceof HttpErrorResponse && error.status > 0 && error.status < 500))
    );
  }
}
