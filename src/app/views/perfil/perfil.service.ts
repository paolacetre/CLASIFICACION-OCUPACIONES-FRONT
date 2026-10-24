import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { text } from '../../shared/api/http-helpers';
import { AuthService, AuthUserDto, serverMessageOf } from '../../shared/auth/auth.service';
import { roleLabel } from '../../shared/session';
import { PROJECT_STORAGE_PREFIX } from '../../proyecto/config';
import { PROFILE_ENTITY, ProfileData } from './perfil.model';

/** El servidor no aceptó los datos del perfil (p. ej. una foto que no es imagen o demasiado grande); lleva su mensaje. */
export const PROFILE_INVALID = 'PROFILE_INVALID';

/** Error de Perfil: `message` es el código y `serverMessage` el texto del servidor, si lo dio. */
export class ProfileError extends Error {
  constructor(code: string, readonly serverMessage = '') {
    super(code);
  }
}

/** Clave de localStorage donde versiones anteriores guardaban la foto de un usuario. */
export function photoStorageKey(userId: number): string {
  return `${PROJECT_STORAGE_PREFIX}_profile_photo_${userId}`;
}

/** Clave de localStorage donde versiones anteriores guardaban la descripción profesional de un usuario. */
export function descriptionStorageKey(userId: number): string {
  return `${PROJECT_STORAGE_PREFIX}_profile_description_${userId}`;
}

/** `GET` y `PATCH /api/mi-cuenta/perfil`. */
interface PerfilCuentaDto {
  email: string;
  nombreApellido: string;
  telefono: string;
  descripcion: string;
  /** Data URL de la imagen, o null si no tiene. */
  avatar: string | null;
}

/** `GET /usuario/:id` (solo para Administrador y Analista): de aquí sale la fecha de creación. */
interface UsuarioDto {
  /** YYYY-MM-DD. */
  fechaCreacion: string | null;
}

/** 'YYYY-MM-DD…' → 'DD/MM/YYYY' (sin convertir zona horaria); vacío si no hay fecha. */
function toDisplayDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/**
 * Perfil de quien inició sesión, contra el backend.
 *
 * - Id y rol salen de `GET /auth/me`; nombre y apellido, teléfono, descripción
 *   y foto, de `GET /api/mi-cuenta/perfil`, y se guardan con
 *   `PATCH /api/mi-cuenta/perfil` (cualquier rol edita lo suyo; el correo no
 *   se cambia aquí). La fecha de creación sale de `GET /usuario/:id`, que el
 *   backend solo entrega al administrador y al analista.
 * - Versiones anteriores guardaban la foto y la descripción en el navegador:
 *   si el servidor aún no las tiene, se muestran las de aquí y suben al guardar.
 */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  /** El perfil al día de la sesión actual. */
  get(): Observable<ProfileData> {
    return forkJoin({
      me: this.http.get<AuthUserDto>('/auth/me'),
      cuenta: this.http.get<PerfilCuentaDto>('/api/mi-cuenta/perfil')
    }).pipe(
      map(({ me, cuenta }) => this.toProfile(me, cuenta)),
      switchMap((profile) =>
        this.http.get<UsuarioDto>(`/usuario/${profile.id}`).pipe(
          map((usuario) => ({ ...profile, dateJoined: toDisplayDate(usuario.fechaCreacion) })),
          // La fecha de creación solo la leen el administrador y el analista: sin ella, el perfil se muestra igual.
          catchError(() => of(profile))
        )
      )
    );
  }

  /** Guarda nombre y apellido, teléfono, descripción y foto (`PATCH /api/mi-cuenta/perfil`; sin foto, `avatar: null` la quita). */
  update(profile: ProfileData): Observable<ProfileData> {
    return defer(() =>
      this.http.patch<PerfilCuentaDto>('/api/mi-cuenta/perfil', {
        nombreApellido: profile.name.trim(),
        telefono: profile.phone.trim(),
        descripcion: profile.description.trim(),
        avatar: profile.photoUrl || null
      })
    ).pipe(
      catchError((error: unknown) =>
        throwError(() => (error instanceof HttpErrorResponse && error.status === 400 ? new ProfileError(PROFILE_INVALID, serverMessageOf(error)) : error))
      ),
      map((cuenta) => {
        // Ya están en el servidor: lo que guardaban versiones anteriores en este navegador sobra.
        this.forget(photoStorageKey(profile.id));
        this.forget(descriptionStorageKey(profile.id));
        return {
          ...profile,
          name: text(cuenta.nombreApellido),
          phone: text(cuenta.telefono),
          description: text(cuenta.descripcion),
          photoUrl: text(cuenta.avatar)
        };
      })
    );
  }

  /** Cambia la contraseña de quien tiene la sesión (`PATCH /auth/change-password`, ver `AuthService`). */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.authService.changePassword(currentPassword, newPassword);
  }

  /** Traduce la cuenta del backend al perfil de la pantalla. */
  private toProfile(me: AuthUserDto, cuenta: PerfilCuentaDto): ProfileData {
    const email = text(cuenta.email) || text(me.email);
    return {
      id: me.id,
      name: text(cuenta.nombreApellido) || text(me.nombreApellido) || text(me.usuario),
      email,
      phone: text(cuenta.telefono),
      role: roleLabel(text(me.role)),
      entity: PROFILE_ENTITY,
      dateJoined: '',
      photoUrl: text(cuenta.avatar) || this.kept(photoStorageKey(me.id)),
      description: text(cuenta.descripcion) || this.kept(descriptionStorageKey(me.id))
    };
  }

  /** Lo que guardaron versiones anteriores en este navegador bajo esa clave. */
  private kept(key: string): string {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  }

  private forget(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Sin almacenamiento disponible no hay nada que borrar.
    }
  }
}
