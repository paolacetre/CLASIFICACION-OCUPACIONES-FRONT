import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, finalize, map, of, throwError } from 'rxjs';
import { SessionAccount, SessionStore, SessionUser } from './session.store';

/** El usuario no existe o la contraseña no coincide (el servidor responde lo mismo en ambos casos). */
export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
/** La cuenta existe pero está inactiva. */
export const USER_INACTIVE = 'USER_INACTIVE';
/** Se escribió un correo que no es del SENA: con otro dominio se ingresa con la cédula. */
export const EXTERNAL_EMAIL = 'EXTERNAL_EMAIL';
/** El servidor rechazó el ingreso con otro motivo que explica en su mensaje (p. ej. un usuario de la APE). */
export const LOGIN_REJECTED = 'LOGIN_REJECTED';
/** Demasiados intentos seguidos: el servidor limita el ingreso (429). */
export const TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS';
/** No se pudo hablar con el servidor (caído, sin red…). */
export const LOGIN_UNAVAILABLE = 'LOGIN_UNAVAILABLE';
/** La contraseña actual que se escribió no es la de la cuenta (401 de `PATCH /auth/change-password`). */
export const WRONG_CURRENT_PASSWORD = 'WRONG_CURRENT_PASSWORD';
/** El servidor no aceptó la contraseña nueva (400: política de contraseñas, igual a la actual, datos personales…). */
export const INVALID_NEW_PASSWORD = 'INVALID_NEW_PASSWORD';

/** Límite del servidor para `POST /auth/login`: intentos por ventana (back/src/modules/auth/auth.controller.ts). */
export const MAX_LOGIN_ATTEMPTS = 10;
/** Duración de esa ventana, en minutos. */
export const LOCKOUT_MINUTES = 1;

/** Error de autenticación: `message` es el código estable y `serverMessage` el texto del servidor, si lo dio. */
export class AuthError extends Error {
  constructor(code: string, readonly serverMessage = '') {
    super(code);
  }
}

/** `user` de `POST /auth/login` y respuesta de `GET /auth/me`. */
export interface AuthUserDto {
  id: number;
  email: string;
  usuario: string;
  /** Nombre y apellido en un solo campo (`usuario.nombre_apellido`). */
  nombreApellido: string;
  telefono: string;
  role: string;
  debeCambiarContrasena: boolean;
}

/** Cuenta de la sesión a partir de lo que responde el servidor. */
export function toSessionAccount(dto: AuthUserDto): SessionAccount {
  const email = (dto.email || dto.usuario || '').trim();
  return {
    id: dto.id,
    name: (dto.nombreApellido ?? '').trim() || email,
    email,
    backendRole: dto.role ?? '',
    mustChangePassword: dto.debeCambiarContrasena === true
  };
}

/** Texto del error que responde el backend: su filtro lo anida en `message` (texto, lista o `{ message }`). */
export function serverMessageOf(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return '';
  }
  const body = error.error as { message?: unknown } | null;
  const outer = body?.message;
  const inner = outer && typeof outer === 'object' && !Array.isArray(outer) ? (outer as { message?: unknown }).message : outer;
  return Array.isArray(inner) ? inner.join(' ') : typeof inner === 'string' ? inner : '';
}

/**
 * Inicio y cierre de sesión contra el backend.
 *
 * - `POST /auth/login` con `{ identifier, password }` (correo SENA o cédula)
 *   deja el token en una cookie httpOnly y responde quién ingresó; la sesión
 *   queda en `SessionStore`. El navegador envía la cookie solo en cada llamada.
 * - El servidor responde 401 tanto si la cuenta no existe como si la contraseña
 *   no coincide (no revela qué cuentas existen), 401 con otro mensaje si la
 *   cuenta está inactiva o el correo no es del SENA, y 429 si se superan los
 *   intentos permitidos.
 * - `POST /auth/logout` revoca el token en el servidor y borra la cookie.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly sessionStore = inject(SessionStore);

  /** Quién tiene la sesión iniciada (o `null`). */
  readonly user = this.sessionStore.user;
  readonly isLoggedIn = this.sessionStore.isLoggedIn;
  /** La sesión está abierta con la contraseña temporal: hay que cambiarla antes de seguir. */
  readonly mustChangePassword = this.sessionStore.mustChangePassword;
  /** La sesión anterior se cerró porque el servidor la dio por vencida. */
  readonly sessionExpired = this.sessionStore.expired;

  /** Inicia sesión; con `remember` se sigue con la sesión al volver a abrir el navegador (hasta que venza en el servidor). */
  login(identifier: string, password: string, remember = false): Observable<SessionUser> {
    return this.http.post<{ user: AuthUserDto }>('/auth/login', { identifier: identifier.trim(), password }).pipe(
      catchError((error: unknown) => throwError(() => loginError(error))),
      map(({ user }) => {
        this.sessionStore.start(toSessionAccount(user), remember);
        return this.sessionStore.user()!;
      })
    );
  }

  /** Pone al día la sesión con `GET /auth/me` (nombre, rol y si la contraseña es temporal). Un 401 lo maneja el interceptor. */
  refresh(): Observable<void> {
    return this.http.get<AuthUserDto>('/auth/me').pipe(map((dto) => this.sessionStore.refresh(toSessionAccount(dto))));
  }

  /**
   * `PATCH /auth/change-password` con `{ currentPassword, newPassword }`. Si la
   * contraseña era temporal, la sesión vuelve a tener acceso normal.
   */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.patch('/auth/change-password', { currentPassword, newPassword }).pipe(
      map(() => this.sessionStore.passwordChanged()),
      catchError((error: unknown) => {
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        const code = status === 401 ? WRONG_CURRENT_PASSWORD : status === 400 ? INVALID_NEW_PASSWORD : '';
        return throwError(() => (code ? new AuthError(code, serverMessageOf(error)) : error));
      })
    );
  }

  /** El nombre de quien tiene la sesión cambió en su perfil. */
  renameSession(name: string): void {
    this.sessionStore.rename(name);
  }

  /**
   * Cierra la sesión: `POST /auth/logout` revoca el token y borra la cookie. Aunque
   * el servidor no responda, la sesión se olvida en el navegador.
   */
  logout(): Observable<void> {
    return defer(() => this.http.post('/auth/logout', {})).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
      finalize(() => this.sessionStore.clear())
    );
  }
}

/** Traduce la respuesta de error del ingreso a un código estable que la pantalla sabe explicar. */
function loginError(error: unknown): AuthError {
  if (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500) {
    return new AuthError(LOGIN_UNAVAILABLE);
  }
  if (error.status === 429) {
    return new AuthError(TOO_MANY_ATTEMPTS);
  }
  const message = serverMessageOf(error);
  if (error.status === 401 || error.status === 400) {
    if (/inactiva/i.test(message)) {
      return new AuthError(USER_INACTIVE, message);
    }
    if (/correos del SENA/i.test(message)) {
      return new AuthError(EXTERNAL_EMAIL, message);
    }
    if (error.status === 401 && /credenciales/i.test(message)) {
      return new AuthError(INVALID_CREDENTIALS, message);
    }
    return message ? new AuthError(LOGIN_REJECTED, message) : new AuthError(INVALID_CREDENTIALS);
  }
  return new AuthError(LOGIN_UNAVAILABLE);
}
