/// <reference types="jasmine" />

/*
 * Sesión (SessionStore) y reglas del ingreso, ejercitadas con el doble de
 * pruebas FakeAuthService. El servicio real, que llama al backend, se prueba en
 * auth.service.spec.ts.
 */
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MOCK_LATENCY_MS } from '../api/mock-api';
import { SESSION } from '../session';
import { UsuariosService } from '../../views/usuarios/usuarios.service';
import { AuthService, INVALID_CREDENTIALS, LOCKOUT_MINUTES, MAX_LOGIN_ATTEMPTS, TOO_MANY_ATTEMPTS, USER_INACTIVE } from './auth.service';
import { SESSION_STORAGE_KEY, SessionStore } from './session.store';
import { clearTestSession, endTestSession, startTestSession } from './session.testing';

describe('Sesión e ingreso (FakeAuthService)', () => {
  let auth: AuthService;

  beforeEach(() => {
    clearTestSession();
    TestBed.configureTestingModule({});
    auth = TestBed.inject(AuthService);
  });
  afterEach(() => clearTestSession());

  function login(identifier: string, password: string): { error?: string } {
    const result: { error?: string } = {};
    auth.login(identifier, password).subscribe({ error: (e: Error) => (result.error = e.message) });
    tick(MOCK_LATENCY_MS);
    return result;
  }

  it('should start without a session (no role, no permissions)', () => {
    expect(auth.isLoggedIn()).toBeFalse();
    expect(TestBed.inject(SESSION).role).toBe('');
  });

  it('should sign in with valid credentials, ignoring case and spaces in the email', fakeAsync(() => {
    const result = login('  ADMIN@sena.edu.co ', 'Admin*Password2026');
    expect(result.error).toBeUndefined();
    expect(auth.user()).toEqual({ id: 1, name: 'SENA Admin', email: 'admin@sena.edu.co', role: 'Administrador' });
    expect(TestBed.inject(SESSION).role).toBe('Administrador');
    endTestSession();
  }));

  it('should sign in with the ID number too', fakeAsync(() => {
    expect(login('1000000001', 'Admin*Password2026').error).toBeUndefined();
    expect(auth.user()?.id).toBe(1);
    endTestSession();
  }));

  it('should keep who signed in, never the password nor a token', fakeAsync(() => {
    login('admin@sena.edu.co', 'Admin*Password2026');
    const saved = sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '';
    expect(JSON.parse(saved).user.id).toBe(1);
    expect(saved).not.toContain('Admin*Password2026');
    expect(TestBed.inject(SessionStore).startedAt()).not.toBeNull();
    endTestSession();
  }));

  it('should reject a wrong password or an unknown account with the same error', fakeAsync(() => {
    expect(login('admin@sena.edu.co', 'otra').error).toBe(INVALID_CREDENTIALS);
    expect(login('nadie@sena.edu.co', 'Admin*Password2026').error).toBe(INVALID_CREDENTIALS);
    expect(auth.isLoggedIn()).toBeFalse();
  }));

  it('should lock the account after too many failed attempts, even with the right password', fakeAsync(() => {
    for (let i = 1; i < MAX_LOGIN_ATTEMPTS; i++) {
      expect(login('analista@sena.edu.co', 'mala').error).toBe(INVALID_CREDENTIALS);
    }
    expect(login('analista@sena.edu.co', 'mala').error).toBe(TOO_MANY_ATTEMPTS);
    expect(login('analista@sena.edu.co', 'Analista*Password2026').error).toBe(TOO_MANY_ATTEMPTS);
    // Otra cuenta no queda bloqueada.
    expect(login('admin@sena.edu.co', 'Admin*Password2026').error).toBeUndefined();
    endTestSession();

    // Pasado el bloqueo (fakeAsync también adelanta la hora), vuelve a ingresar.
    tick(LOCKOUT_MINUTES * 60_000);
    expect(login('analista@sena.edu.co', 'Analista*Password2026').error).toBeUndefined();
    endTestSession();
  }));

  it('should reject an inactive user', fakeAsync(() => {
    startTestSession();
    TestBed.inject(UsuariosService).setStatus(2, 'Inactivo').subscribe();
    tick(MOCK_LATENCY_MS);
    endTestSession();

    expect(login('analista@sena.edu.co', 'Analista*Password2026').error).toBe(USER_INACTIVE);
    expect(auth.isLoggedIn()).toBeFalse();
  }));

  it('should sign in a new account with its ID number as a temporary password, and ask to change it', fakeAsync(() => {
    startTestSession();
    TestBed.inject(UsuariosService)
      .create({ name: 'Nueva Persona', email: 'nueva@correo.com', document: '1.234.567', phone: '3001234567', role: 'Analista' })
      .subscribe();
    tick(MOCK_LATENCY_MS);
    endTestSession();

    expect(login('1234567', '1234567').error).toBeUndefined();
    expect(auth.mustChangePassword()).toBeTrue();
    auth.changePassword('1234567', 'Nueva*Clave2026').subscribe();
    tick(MOCK_LATENCY_MS);
    expect(auth.mustChangePassword()).toBeFalse();
    endTestSession();
  }));

  it('should sign out and forget the saved session', fakeAsync(() => {
    login('admin@sena.edu.co', 'Admin*Password2026');
    auth.logout().subscribe();
    tick(MOCK_LATENCY_MS);
    expect(auth.isLoggedIn()).toBeFalse();
    expect(auth.sessionExpired()).toBeFalse();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  }));

  it('should close the session as expired when the server rejects it', fakeAsync(() => {
    login('admin@sena.edu.co', 'Admin*Password2026');
    TestBed.inject(SessionStore).expire();
    expect(auth.isLoggedIn()).toBeFalse();
    expect(auth.sessionExpired()).toBeTrue();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  }));

  it('should restore the session after reloading the page', () => {
    startTestSession({ id: 2, name: 'Analista TDO', email: 'analista@sena.edu.co', role: 'Analista' }, true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const store = TestBed.inject(SessionStore);
    expect(store.user()?.role).toBe('Analista');
    expect(store.mustChangePassword()).toBeTrue();
    endTestSession();
  });

  it('should discard an unreadable session saved in the browser', () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, 'no-es-una-sesion');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(SessionStore).isLoggedIn()).toBeFalse();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('should never return passwords from the users API', () => {
    let users: object[] = [];
    TestBed.inject(UsuariosService).list().subscribe((list) => (users = list));
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((user) => !('password' in user))).toBeTrue();
  });
});
