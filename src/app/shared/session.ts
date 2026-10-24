import { InjectionToken, inject } from '@angular/core';
import { SessionStore } from './auth/session.store';

/** Rol con acceso a todo el shell (el resto ve la pantalla de acceso restringido). */
export const ADMIN_ROLE = 'Administrador';

/** Roles del backend (tabla `rol`) y el nombre con el que se muestran y comparan en el front. */
export const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: ADMIN_ROLE,
  ANALISTA: 'Analista',
  EXPERTO: 'Experto',
  CIUDADANO: 'Ciudadano',
  APE: 'APE',
  TENDENCIAS_OCUPACIONES: 'Tendencias ocupacionales'
};

/** Nombre de un rol del backend, p. ej. 'ADMINISTRADOR' → 'Administrador' (uno desconocido se muestra tal cual). */
export function roleLabel(rol: string): string {
  return ROLE_LABELS[rol.toUpperCase()] ?? rol;
}

/** Rol del backend que corresponde a un nombre del front; lo usan las pruebas para armar tokens. */
export function backendRoleOf(label: string): string {
  return Object.keys(ROLE_LABELS).find((rol) => ROLE_LABELS[rol] === label) ?? label;
}

/** Rol y correo de la sesión vigente (vacíos sin sesión). */
export interface SessionInfo {
  role: string;
  email: string;
}

/**
 * La sesión como dependencia inyectable, para leer el rol y el correo de una
 * sola fuente (la usan los dobles de prueba que dependen de quién está
 * conectado) y para que las pruebas puedan simular otro rol. Lee siempre la sesión vigente de
 * `SessionStore` (la que abrió el inicio de sesión); sin sesión, rol y correo
 * quedan vacíos (sin permisos).
 */
export const SESSION = new InjectionToken<SessionInfo>('SESSION', {
  providedIn: 'root',
  factory: () => {
    const store = inject(SessionStore);
    return {
      get role() {
        return store.user()?.role ?? '';
      },
      get email() {
        return store.user()?.email ?? '';
      }
    };
  }
});
