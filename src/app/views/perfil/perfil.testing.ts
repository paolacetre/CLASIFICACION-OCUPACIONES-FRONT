import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { MOCK_LATENCY_MS, clone, mockResponse } from '../../shared/api/mock-api';
import { AuthService } from '../../shared/auth/auth.service';
import { SessionStore } from '../../shared/auth/session.store';
import { UsuariosService } from '../usuarios/usuarios.service';
import { PROFILE_ENTITY, ProfileData, createEmptyProfile } from './perfil.model';
import { PerfilService } from './perfil.service';

/**
 * Solo para pruebas: doble de `PerfilService`. Arma el perfil con la sesión y
 * los usuarios de prueba, guarda los cambios en memoria y cambia la contraseña
 * con `AuthService` (en las pruebas, el doble que valida contra el almacén de
 * credenciales de prueba).
 */
@Injectable()
export class FakePerfilService implements Pick<PerfilService, keyof PerfilService> {
  private readonly usuariosService = inject(UsuariosService);
  private readonly authService = inject(AuthService);
  private readonly sessionStore = inject(SessionStore);

  /** Perfiles ya guardados, por id de usuario. */
  private readonly saved = new Map<number, ProfileData>();

  get(): Observable<ProfileData> {
    const session = this.sessionStore.user();
    return this.usuariosService.list().pipe(
      map((users) => {
        if (!session) {
          return createEmptyProfile();
        }
        const stored = this.saved.get(session.id);
        if (stored) {
          return clone(stored);
        }
        const user = users.find((item) => item.email.toLowerCase() === session.email.toLowerCase());
        return {
          id: session.id,
          name: user?.name ?? session.name,
          email: session.email,
          phone: user?.phone ?? '',
          role: session.role,
          entity: PROFILE_ENTITY,
          dateJoined: user?.date ?? '',
          photoUrl: '',
          description: ''
        };
      })
    );
  }

  update(profile: ProfileData): Observable<ProfileData> {
    return mockResponse(() => {
      const saved = { ...profile, name: profile.name.trim(), phone: profile.phone.trim(), description: profile.description.trim() };
      this.saved.set(profile.id, clone(saved));
      return clone(saved);
    }, MOCK_LATENCY_MS);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.authService.changePassword(currentPassword, newPassword);
  }
}
