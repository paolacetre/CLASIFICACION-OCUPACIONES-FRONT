/**
 * Roles del sistema. Deben coincidir exactamente con `clasificacion.roles.nombre`.
 * APE (Agencia Pública de Empleo) no estaba en el enunciado original de 4 roles,
 * pero ya existe en la base de datos, el seed y las guards del frontend — se mantiene
 * para no romper ese flujo.
 */
export enum Role {
  ADMINISTRADOR = 'ADMINISTRADOR',
  ANALISTA = 'ANALISTA',
  EXPERTO = 'EXPERTO',
  CIUDADANO = 'CIUDADANO',
  APE = 'APE',
  TENDENCIAS_OCUPACIONES = 'TENDENCIAS_OCUPACIONES',
}

/** Claves de rol que consume el frontend (usuarios.component, AuthService). */
export type FrontendRoleKey = 'admin' | 'analyst' | 'expert' | 'citizen' | 'ape' | 'tendencias';

const ROLE_TO_FRONTEND_KEY: Record<Role, FrontendRoleKey> = {
  [Role.ADMINISTRADOR]: 'admin',
  [Role.ANALISTA]: 'analyst',
  [Role.EXPERTO]: 'expert',
  [Role.CIUDADANO]: 'citizen',
  [Role.APE]: 'ape',
  [Role.TENDENCIAS_OCUPACIONES]: 'tendencias',
};

const FRONTEND_KEY_TO_ROLE: Record<FrontendRoleKey, Role> = {
  admin: Role.ADMINISTRADOR,
  analyst: Role.ANALISTA,
  expert: Role.EXPERTO,
  citizen: Role.CIUDADANO,
  ape: Role.APE,
  tendencias: Role.TENDENCIAS_OCUPACIONES,
};

/** Convierte el nombre de rol de la BD (o el enum) a la clave que espera el frontend. */
export function roleToFrontendKey(role: string | null | undefined): FrontendRoleKey {
  const normalized = (role ?? '').toUpperCase() as Role;
  return ROLE_TO_FRONTEND_KEY[normalized] ?? 'citizen';
}

/**
 * Convierte lo que envía el frontend (clave corta como 'admin' o el nombre completo
 * como 'ADMINISTRADOR') al enum Role. Devuelve `null` si no matchea ningún rol válido.
 */
export function parseRole(value: string | null | undefined): Role | null {
  if (!value) return null;
  const trimmed = value.trim();

  const byFrontendKey = FRONTEND_KEY_TO_ROLE[trimmed.toLowerCase() as FrontendRoleKey];
  if (byFrontendKey) return byFrontendKey;

  const upper = trimmed.toUpperCase();
  return (Object.values(Role) as string[]).includes(upper) ? (upper as Role) : null;
}
