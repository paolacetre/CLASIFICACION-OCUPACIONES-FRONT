import { SetMetadata } from '@nestjs/common';

export const CACHE_CATALOGO = 'cache:catalogo';

export interface OpcionesCacheCatalogo {
  /** Segundos de vida; por defecto CACHE_TTL_SECONDS. */
  ttl?: number;
}

/**
 * Cachea en Redis las respuestas GET del controlador (o del método) donde se
 * aplique. Solo para respuestas que NO dependen del usuario: el guard de roles
 * corre antes que el interceptor, así que el permiso se sigue validando en
 * cada petición, pero el contenido se comparte entre todos.
 */
export const CacheCatalogo = (opciones: OpcionesCacheCatalogo = {}) => SetMetadata(CACHE_CATALOGO, opciones);

/** Excluye un método de un controlador marcado con @CacheCatalogo (p. ej. los que escriben con @Res). */
export const SinCache = () => SetMetadata(CACHE_CATALOGO, false);
