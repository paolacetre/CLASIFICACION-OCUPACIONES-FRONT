/** Entidad a la que pertenecen las cuentas de la plataforma (el backend no la guarda por usuario). */
export const PROFILE_ENTITY = 'Servicio Nacional de Aprendizaje (SENA)';

/** Perfil de quien tiene la sesión (lo que muestra y edita la vista Perfil). */
export interface ProfileData {
  /** Id del usuario en el backend. */
  id: number;
  /** Nombre y apellido en un solo campo, como los guarda el backend. */
  name: string;
  email: string;
  /** Teléfono de contacto; cadena vacía si no tiene. */
  phone: string;
  /** Nombre del rol en el front: 'Administrador', 'Analista'… */
  role: string;
  entity: string;
  /** Fecha de creación de la cuenta (DD/MM/YYYY); vacía si el backend no la entrega a este rol. */
  dateJoined: string;
  /** Foto de perfil como data URL (la guarda el servidor); cadena vacía si no tiene. */
  photoUrl: string;
  /** Descripción profesional (la guarda el servidor). */
  description: string;
}

/** Perfil sin datos, mientras llega el del backend. */
export function createEmptyProfile(): ProfileData {
  return { id: 0, name: '', email: '', phone: '', role: '', entity: PROFILE_ENTITY, dateJoined: '', photoUrl: '', description: '' };
}
