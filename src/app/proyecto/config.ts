/**
 * Identidad del proyecto. Todo lo que cambia entre proyectos vive en
 * `src/app/proyecto/` (esta configuración, el menú y los textos) y en las
 * vistas de `src/app/views/` propias del proyecto; el resto de la app es
 * común y debe quedar idéntico en todos los proyectos.
 */

/**
 * Prefijo de las claves de localStorage y sessionStorage (configuración, sesión, vista abierta).
 * Debe ser distinto en cada proyecto: si dos proyectos corren en el mismo
 * dominio (p. ej. localhost:4200), con el mismo prefijo compartirían la
 * configuración.
 */
export const PROJECT_STORAGE_PREFIX = 'clasificacion';

/**
 * Vistas (ids del menú) que ve cada rol distinto de Administrador, que ve todo. El menú de ese rol
 * solo trae esas opciones (sin Gestión de usuarios) y abre en la primera. Un rol que no esté aquí
 * ve la pantalla de acceso restringido. Los permisos reales los decide siempre el backend.
 */
export const ROLE_VIEWS: Readonly<Record<string, readonly string[]>> = {
  Experto: ['validaciones']
};

/** Enlace a otra aplicación desde la pantalla de ingreso. */
export interface LoginLink {
  /** Texto del botón (clave de traducción). */
  labelKey: string;
  url: string;
  /** Trazos SVG del ícono (viewBox 0 0 24 24). */
  icon: string;
}

/**
 * Botones de la esquina superior izquierda del ingreso: llevan al sitio
 * público del Observatorio y a la otra aplicación (aquí, Tendencias). Se
 * abren en una pestaña aparte. Lista vacía = no se muestran.
 */
export const LOGIN_LINKS: readonly LoginLink[] = [
  { labelKey: 'login.linkWebsite', url: 'https://oloserver.tail033823.ts.net/', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.4 3.7 5.4 3.7 9s-1.2 6.6-3.7 9c-2.5-2.4-3.7-5.4-3.7-9s1.2-6.6 3.7-9Z' },
  { labelKey: 'login.linkTendencias', url: 'https://oloserver.tail033823.ts.net/tendencias/', icon: 'M3 17l6-6 4 4 8-8M15 7h6v6' }
];
