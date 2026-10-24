import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap } from 'rxjs';
import { MOCK_LATENCY_MS, mockResponse } from '../api/mock-api';
import { MockCredentialsStore } from '../api/mock-credentials';
import { User } from '../../views/usuarios/usuarios.model';
import { UsuariosService } from '../../views/usuarios/usuarios.service';
import { backendRoleOf } from '../session';
import {
  AuthError,
  AuthService,
  INVALID_CREDENTIALS,
  LOCKOUT_MINUTES,
  MAX_LOGIN_ATTEMPTS,
  TOO_MANY_ATTEMPTS,
  USER_INACTIVE,
  WRONG_CURRENT_PASSWORD
} from './auth.service';
import { SessionStore, SessionUser } from './session.store';

/**
 * Solo para pruebas: doble de `AuthService` que no llama al backend. Valida
 * contra los usuarios de prueba y aplica las mismas reglas que el servidor
 * (mismo error si la cuenta no existe o la contraseña no coincide, cuenta
 * inactiva, bloqueo tras varios intentos). Una cuenta con `mustChangePassword`
 * entra con la contraseña temporal pendiente de cambio.
 */
@Injectable()
export class FakeAuthService implements Pick<AuthService, keyof AuthService> {
  private readonly usuariosService = inject(UsuariosService);
  private readonly credentials = inject(MockCredentialsStore);
  private readonly sessionStore = inject(SessionStore);

  readonly user = this.sessionStore.user;
  readonly isLoggedIn = this.sessionStore.isLoggedIn;
  readonly mustChangePassword = this.sessionStore.mustChangePassword;
  readonly sessionExpired = this.sessionStore.expired;

  /** Intentos fallidos por identificador. */
  private readonly failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

  login(identifier: string, password: string, remember = false): Observable<SessionUser> {
    const normalized = identifier.trim().toLowerCase();
    return this.usuariosService.list().pipe(
      switchMap((users) => mockResponse(() => this.authenticate(users, normalized, password), MOCK_LATENCY_MS)),
      map((user) => {
        this.sessionStore.start(
          { id: user.id, name: user.name, email: user.email, backendRole: backendRoleOf(user.role), mustChangePassword: user.mustChangePassword },
          remember
        );
        return this.sessionStore.user()!;
      })
    );
  }

  refresh(): Observable<void> {
    return of(undefined);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return mockResponse(() => {
      const id = this.sessionStore.user()?.id ?? -1;
      if (!this.credentials.verify(id, currentPassword)) {
        throw new AuthError(WRONG_CURRENT_PASSWORD);
      }
      this.credentials.set(id, newPassword);
      this.sessionStore.passwordChanged();
    });
  }

  renameSession(name: string): void {
    this.sessionStore.rename(name);
  }

  logout(): Observable<void> {
    return mockResponse(() => this.sessionStore.clear(), MOCK_LATENCY_MS);
  }

  /** Busca la cuenta por correo o cédula y comprueba la contraseña, con el mismo bloqueo del servidor. */
  private authenticate(users: User[], identifier: string, password: string): User {
    const now = Date.now();
    const attempts = this.failedAttempts.get(identifier);
    if (attempts && attempts.lockedUntil > now) {
      throw new AuthError(TOO_MANY_ATTEMPTS);
    }

    const user = users.find((item) => item.email.toLowerCase() === identifier || item.document === identifier);
    if (!user || !this.credentials.verify(user.id, password)) {
      const count = (attempts?.count ?? 0) + 1;
      const locked = count >= MAX_LOGIN_ATTEMPTS;
      this.failedAttempts.set(identifier, { count: locked ? 0 : count, lockedUntil: locked ? now + LOCKOUT_MINUTES * 60_000 : 0 });
      throw new AuthError(locked ? TOO_MANY_ATTEMPTS : INVALID_CREDENTIALS);
    }
    if (user.status !== 'Activo') {
      throw new AuthError(USER_INACTIVE);
    }
    this.failedAttempts.delete(identifier);
    return user;
  }
}
