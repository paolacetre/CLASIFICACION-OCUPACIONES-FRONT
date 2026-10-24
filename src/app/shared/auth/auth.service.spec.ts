/// <reference types="jasmine" />

/*
 * AuthService real: lo que envía al backend y cómo interpreta sus respuestas.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION } from '../session';
import {
  AuthError,
  AuthService,
  AuthUserDto,
  EXTERNAL_EMAIL,
  INVALID_CREDENTIALS,
  INVALID_NEW_PASSWORD,
  LOGIN_REJECTED,
  LOGIN_UNAVAILABLE,
  TOO_MANY_ATTEMPTS,
  USER_INACTIVE,
  WRONG_CURRENT_PASSWORD
} from './auth.service';
import { SESSION_STORAGE_KEY } from './session.store';
import { clearTestSession, endTestSession } from './session.testing';

describe('AuthService', () => {
  let auth: AuthService;
  let backend: HttpTestingController;

  const user = (role = 'ADMINISTRADOR', debeCambiarContrasena = false): AuthUserDto => ({
    id: 7,
    email: 'admin@sena.edu.co',
    usuario: 'admin@sena.edu.co',
    nombreApellido: 'Ana Ríos',
    telefono: '',
    role,
    debeCambiarContrasena
  });
  /** Cuerpo de error tal como lo arma el filtro del backend. */
  const failure = (message: string, statusCode: number) => ({ statusCode, path: '/auth/login', message: { message, statusCode } });

  beforeEach(() => {
    clearTestSession();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useClass: AuthService }, provideHttpClient(), provideHttpClientTesting()]
    });
    auth = TestBed.inject(AuthService);
    backend = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    backend.verify();
    endTestSession();
    clearTestSession();
  });

  function login(flush: (request: ReturnType<HttpTestingController['expectOne']>) => void, remember = false): AuthError | undefined {
    let error: AuthError | undefined;
    auth.login('  admin@sena.edu.co ', 'Sena2026*', remember).subscribe({ error: (e: AuthError) => (error = e) });
    flush(backend.expectOne('/auth/login'));
    return error;
  }

  it('should post the identifier and password, and open the session with who signed in (the token stays in the cookie)', () => {
    const error = login((request) => {
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ identifier: 'admin@sena.edu.co', password: 'Sena2026*' });
      request.flush({ user: user() });
    });

    expect(error).toBeUndefined();
    expect(auth.isLoggedIn()).toBeTrue();
    expect(auth.mustChangePassword()).toBeFalse();
    expect(auth.user()).toEqual({ id: 7, name: 'Ana Ríos', email: 'admin@sena.edu.co', role: 'Administrador' });
    expect(TestBed.inject(SESSION).role).toBe('Administrador');
    const stored = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
    expect(stored.user.email).toBe('admin@sena.edu.co');
    expect(JSON.stringify(stored)).not.toContain('token');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('should keep the session in localStorage with "Mantener la sesión iniciada" and name the other roles', () => {
    login((request) => request.flush({ user: user('EXPERTO') }), true);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(auth.user()?.role).toBe('Experto');
  });

  it('should open the session asking to change a temporary password', () => {
    login((request) => request.flush({ user: user('ANALISTA', true) }));
    expect(auth.isLoggedIn()).toBeTrue();
    expect(auth.mustChangePassword()).toBeTrue();
  });

  it('should translate the server errors into stable codes', () => {
    const unauthorized = { status: 401, statusText: 'Unauthorized' };
    expect(login((request) => request.flush(failure('Credenciales inválidas', 401), unauthorized))?.message).toBe(INVALID_CREDENTIALS);
    expect(login((request) => request.flush(failure('Tu cuenta está inactiva. Contacta a un administrador.', 401), unauthorized))?.message).toBe(USER_INACTIVE);
    expect(login((request) => request.flush(failure('Solo los correos del SENA sirven para ingresar.', 401), unauthorized))?.message).toBe(EXTERNAL_EMAIL);
    const ape = login((request) => request.flush(failure('Los usuarios de la APE deben ingresar desde la opción "Usuario de la APE".', 401), unauthorized));
    expect(ape?.message).toBe(LOGIN_REJECTED);
    expect(ape?.serverMessage).toContain('APE');
    expect(login((request) => request.flush(failure('ThrottlerException: Too Many Requests', 429), { status: 429, statusText: 'Too Many Requests' }))?.message).toBe(TOO_MANY_ATTEMPTS);
    expect(login((request) => request.error(new ProgressEvent('error')))?.message).toBe(LOGIN_UNAVAILABLE);
    expect(auth.isLoggedIn()).toBeFalse();
  });

  it('should refresh the session with GET /auth/me', () => {
    login((request) => request.flush({ user: user() }));
    auth.refresh().subscribe();
    backend.expectOne('/auth/me').flush({ ...user('ANALISTA', true), nombreApellido: 'Ana María Ríos' });
    expect(auth.user()).toEqual({ id: 7, name: 'Ana María Ríos', email: 'admin@sena.edu.co', role: 'Analista' });
    expect(auth.mustChangePassword()).toBeTrue();
  });

  it('should change the password and give back normal access to a temporary-password session', () => {
    login((request) => request.flush({ user: user('ANALISTA', true) }));
    auth.changePassword('1234567', 'Nueva*Clave2026').subscribe();
    const request = backend.expectOne('/auth/change-password');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ currentPassword: '1234567', newPassword: 'Nueva*Clave2026' });
    request.flush({ message: 'Contraseña actualizada correctamente' });
    expect(auth.mustChangePassword()).toBeFalse();
  });

  it('should explain why the password was not changed', () => {
    login((request) => request.flush({ user: user() }));
    const errors: AuthError[] = [];
    auth.changePassword('mala', 'Nueva*Clave2026').subscribe({ error: (e: AuthError) => errors.push(e) });
    backend.expectOne('/auth/change-password').flush(failure('La contraseña actual no es correcta', 401), { status: 401, statusText: 'Unauthorized' });
    auth.changePassword('Sena2026*', 'Ana*Rios2026').subscribe({ error: (e: AuthError) => errors.push(e) });
    backend.expectOne('/auth/change-password').flush(failure('No uses tu nombre en la contraseña', 400), { status: 400, statusText: 'Bad Request' });
    expect(errors.map((error) => error.message)).toEqual([WRONG_CURRENT_PASSWORD, INVALID_NEW_PASSWORD]);
    expect(errors[1].serverMessage).toBe('No uses tu nombre en la contraseña');
  });

  it('should close the session with POST /auth/logout, even if the server does not answer', () => {
    login((request) => request.flush({ user: user() }));
    auth.logout().subscribe();
    const request = backend.expectOne('/auth/logout');
    expect(request.request.method).toBe('POST');
    request.error(new ProgressEvent('error'));
    expect(auth.isLoggedIn()).toBeFalse();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
