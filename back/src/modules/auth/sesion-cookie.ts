import type { CookieOptions, Request } from 'express';
import { ExtractJwt } from 'passport-jwt';

/**
 * Sesión en cookie httpOnly en vez de token en localStorage.
 *
 * Con el JWT en localStorage cualquier script que corriera en la página (una
 * dependencia comprometida, un XSS) podía leerlo y usarlo desde otro equipo.
 * En una cookie httpOnly el navegador lo envía solo y JavaScript no lo ve.
 *
 * SameSite=Lax es la defensa CSRF: el navegador no adjunta la cookie a POST,
 * PUT, PATCH ni DELETE que vengan de otro sitio. El frontend en desarrollo
 * (localhost:4201 → localhost:3000) cuenta como el mismo sitio, así que ahí sí
 * viaja.
 */
export const COOKIE_SESION = 'olo_sesion';

/**
 * `COOKIE_SECURE=true` en cuanto el sitio se sirva por HTTPS: la cookie deja
 * de viajar por HTTP plano. No va activo por defecto porque el despliegue
 * actual puede servirse por HTTP en la red interna, y una cookie Secure sobre
 * HTTP no se guarda: nadie podría iniciar sesión.
 */
export function opcionesCookieSesion(maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    ...(maxAgeMs !== undefined ? { maxAge: Math.max(0, maxAgeMs) } : {}),
  };
}

/** Extractor para passport-jwt: lee el token de la cookie de sesión. */
export function tokenDesdeCookie(req: Request): string | null {
  const cabecera = req?.headers?.cookie;
  if (!cabecera) return null;
  for (const parte of cabecera.split(';')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    if (parte.slice(0, i).trim() !== COOKIE_SESION) continue;
    const valor = parte.slice(i + 1).trim();
    try {
      return decodeURIComponent(valor) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Token de la sesión: la cookie del navegador o, para otros clientes, la cabecera Bearer. */
export function tokenDeSesion(req: Request): string | null {
  return tokenDesdeCookie(req) ?? ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}
