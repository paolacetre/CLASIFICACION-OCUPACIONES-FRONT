/**
 * Modelo de dominio de Usuarios. Vive aparte del componente para que el
 * servicio (la API) y la vista lo compartan sin depender uno del otro.
 */
import { ROLE_LABELS } from '../../shared/session';

/** Nombre del rol en el front ('Administrador', 'Analista', 'Experto'…), el mismo que usa la sesión. */
export type UserRole = string;
/** Estado de la cuenta; una cuenta inactiva no puede ingresar. */
export type UserStatus = 'Activo' | 'Inactivo';
/** Cómo se creó la cuenta: a mano desde esta pantalla o importada de un Excel. */
export type UserOrigin = 'Manual' | 'Excel';

/** Roles que se pueden asignar: los del backend, con su nombre en el front. */
export const USER_ROLES: readonly UserRole[] = Object.values(ROLE_LABELS);
/** Rol con el que empieza el formulario de un usuario nuevo. */
export const DEFAULT_USER_ROLE: UserRole = ROLE_LABELS['CIUDADANO'];

/** Un permiso del sistema (`labelKey`: su texto). */
export interface UserPermission {
  key: string;
  labelKey: string;
}

const permission = (key: string, label: string): UserPermission => ({ key, labelKey: `usuarios.perm${label}` });

/** Permisos del sistema, en el orden en que se muestran. */
export const USER_PERMISSIONS: readonly UserPermission[] = [
  permission('view_dashboard', 'ViewDashboard'),
  permission('view_ocupacion', 'ViewOccupation'),
  permission('edit_ocupacion', 'EditOccupation'),
  permission('view_analisis', 'ViewAnalysis'),
  permission('edit_analisis', 'EditAnalysis'),
  permission('view_correlacion', 'ViewCorrelation'),
  permission('edit_correlacion', 'EditCorrelation'),
  permission('view_resumen', 'ViewSummary'),
  permission('view_instrumentos', 'ViewInstruments'),
  permission('edit_instrumentos', 'EditInstruments'),
  permission('manage_users', 'ManageUsers')
];

/**
 * Permisos que da cada rol (los mismos del front original). El backend no
 * guarda permisos por usuario: los decide el rol, así que aquí solo se
 * muestran; para cambiarlos se cambia el rol.
 */
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  [ROLE_LABELS['ADMINISTRADOR']]: USER_PERMISSIONS.map((item) => item.key),
  [ROLE_LABELS['EXPERTO']]: ['view_dashboard', 'view_ocupacion', 'view_analisis', 'edit_analisis', 'view_correlacion', 'edit_correlacion', 'view_resumen', 'view_instrumentos'],
  [ROLE_LABELS['ANALISTA']]: ['view_dashboard', 'view_ocupacion', 'view_analisis', 'edit_analisis', 'view_correlacion', 'view_resumen'],
  [ROLE_LABELS['CIUDADANO']]: ['view_dashboard', 'view_ocupacion'],
  [ROLE_LABELS['APE']]: ['view_dashboard', 'view_ocupacion', 'view_correlacion'],
  [ROLE_LABELS['TENDENCIAS_OCUPACIONES']]: ['view_dashboard', 'view_ocupacion', 'view_correlacion']
};

/** Permisos que tiene un rol. */
export function permissionsOf(role: UserRole): UserPermission[] {
  const keys = ROLE_PERMISSIONS[role] ?? [];
  return USER_PERMISSIONS.filter((item) => keys.includes(item.key));
}

/** Usuario como lo muestra la pantalla (traducido de la respuesta del backend; nunca trae la contraseña). */
export interface User {
  id: number;
  /** Nombre y apellido en un solo campo, como lo guarda el backend (si no tiene, su usuario). */
  name: string;
  /** Usuario de acceso, que arma el servidor: el correo si es del SENA; si no, la cédula. */
  username: string;
  email: string;
  /** Cédula (solo dígitos); cadena vacía si no la tiene. */
  document: string;
  /** Teléfono de contacto; cadena vacía si no tiene. */
  phone: string;
  role: UserRole;
  status: UserStatus;
  origin: UserOrigin;
  /** Sigue con la contraseña temporal (su cédula): debe cambiarla al ingresar. */
  mustChangePassword: boolean;
  /** Fecha de creación de la cuenta (DD/MM/YYYY); vacía si no la tiene. */
  date: string;
  initials: string;
}

/**
 * Datos del formulario de crear o editar. No lleva contraseña ni usuario de
 * acceso: la contraseña inicial es la cédula y el usuario lo arma el servidor.
 */
export interface UserDraft {
  /** Nombre y apellido, en un solo campo. */
  name: string;
  email: string;
  /** Cédula: obligatoria al crear (es la contraseña inicial). */
  document: string;
  phone: string;
  role: UserRole;
}

/** Una fila del Excel que no se pudo importar, o que entró con un cambio (un rol que no existe). */
export interface UserImportError {
  /** Número de fila dentro de los datos del archivo. */
  row: number;
  /** Correo o cédula de la fila, si lo traía. */
  user: string;
  message: string;
}

/** Resultado de importar usuarios desde un Excel. */
export interface UserImportResult {
  total: number;
  imported: number;
  /** Cuentas creadas con la cédula como contraseña, que deben cambiarla al ingresar. */
  temporaryPasswords: number;
  errors: UserImportError[];
  /** Filas que sí se crearon pero con algo distinto a lo que traía el archivo. */
  warnings: UserImportError[];
}

/** Correo institucional: con él, el usuario de acceso es el propio correo (misma regla que el backend). */
const SENA_DOMAIN = /@(sena\.edu\.co|soy\.sena\.edu\.co)$/i;

export function isSenaEmail(email: string | null | undefined): boolean {
  return SENA_DOMAIN.test((email ?? '').trim());
}

/** Cédula sin puntos ni espacios: "1.193.847.562 " → "1193847562". */
export function normalizeDocument(value: string | null | undefined): string {
  return (value ?? '').replace(/[.\s]/g, '');
}

/** La cédula tiene de 5 a 12 dígitos (como la valida el servidor). */
export function isValidDocument(value: string): boolean {
  return /^\d{5,12}$/.test(normalizeDocument(value));
}

/** El teléfono tiene de 7 a 15 dígitos (obligatorio al crear, como lo valida el servidor). */
export function isValidPhone(value: string): boolean {
  return /^\d{7,15}$/.test(value.trim());
}

/** Usuario de acceso que armará el servidor: el correo si es del SENA; si no, la cédula (vacío si no hay con qué). */
export function accessUsernameOf(email: string, document: string): string {
  return isSenaEmail(email) ? email.trim().toLowerCase() : normalizeDocument(document);
}
