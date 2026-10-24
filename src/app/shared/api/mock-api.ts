import { Observable } from 'rxjs';

/** Latencia simulada de las operaciones de escritura (ms): da tiempo a ver los estados "Guardando…". */
export const MOCK_LATENCY_MS = 250;

/**
 * Respuesta simulada de la API mientras no hay backend.
 *
 * Todos los servicios de datos (`*.service.ts` de cada vista) devuelven
 * `Observable` con esta función, igual que lo hará `HttpClient`: el día que
 * exista la API, cada método cambia su cuerpo por `this.http.get/post/…` y los
 * componentes no se tocan.
 *
 * `produce` se ejecuta al momento de "responder" (no al llamar), así que una
 * excepción dentro (una validación que falla) llega al suscriptor como error,
 * igual que una respuesta de error del servidor. Con latencia
 * 0 responde de inmediato (útil para lecturas).
 */
export function mockResponse<T>(produce: () => T, latencyMs = 0): Observable<T> {
  return new Observable<T>((subscriber) => {
    const respond = () => {
      try {
        subscriber.next(produce());
        subscriber.complete();
      } catch (error) {
        subscriber.error(error);
      }
    };
    if (latencyMs <= 0) {
      respond();
      return undefined;
    }
    const timer = setTimeout(respond, latencyMs);
    return () => clearTimeout(timer);
  });
}

/** Copia profunda de datos de ejemplo: la "API" nunca entrega sus objetos internos. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}
