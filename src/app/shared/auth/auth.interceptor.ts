import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { SessionStore } from './session.store';

/**
 * Rutas del backend (las mismas que reenvía `proxy.conf.json`). Casi todo cuelga
 * de `/api/`, pero la autenticación y los usuarios no llevan ese prefijo.
 */
export const API_PREFIXES = ['/api/', '/auth/', '/usuario'];

/**
 * Llamadas en las que un 401 no significa "la sesión venció": el ingreso (aún no
 * hay sesión), el cambio de contraseña ("la contraseña actual no es esa") y la
 * salida (la sesión ya se está cerrando).
 */
const NOT_EXPIRY_URLS = ['/auth/login', '/auth/change-password', '/auth/logout'];

/** Código del 403 con que el servidor exige cambiar la contraseña temporal (`CODIGO_CAMBIO_CONTRASENA`). */
export const PASSWORD_CHANGE_REQUIRED = 'CAMBIO_CONTRASENA_REQUERIDO';

/** El 403 dice que la contraseña es temporal: `{ message: { message, codigo } }` según el filtro del backend. */
function requiresPasswordChange(error: HttpErrorResponse): boolean {
  const body = error.error as { codigo?: unknown; message?: { codigo?: unknown } } | null;
  return body?.codigo === PASSWORD_CHANGE_REQUIRED || body?.message?.codigo === PASSWORD_CHANGE_REQUIRED;
}

/**
 * Interceptor de autenticación. El token viaja en una cookie httpOnly que el
 * navegador envía solo (el front y la API comparten origen: `ng serve` los
 * reenvía con el proxy y en producción los sirve Nginx), así que aquí no se
 * agrega ninguna cabecera. Lo que hace es reaccionar a las respuestas del backend:
 * - 401 (sesión vencida, revocada o cuenta desactivada): cierra la sesión como
 *   vencida y la app vuelve a la pantalla de ingreso.
 * - 403 `CAMBIO_CONTRASENA_REQUERIDO`: la sesión pasa a pedir el cambio de la
 *   contraseña temporal.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const sessionStore = inject(SessionStore);
  const isApi = API_PREFIXES.some((prefix) => request.url.startsWith(prefix));

  return next(request).pipe(
    catchError((error: unknown) => {
      if (isApi && error instanceof HttpErrorResponse && sessionStore.isLoggedIn()) {
        if (error.status === 401 && !NOT_EXPIRY_URLS.includes(request.url)) {
          sessionStore.expire();
        } else if (error.status === 403 && requiresPasswordChange(error)) {
          sessionStore.requirePasswordChange();
        }
      }
      return throwError(() => error);
    })
  );
};
