/// <reference types="jasmine" />

import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PASSWORD_CHANGE_REQUIRED, authInterceptor } from './auth.interceptor';
import { SessionStore } from './session.store';
import { clearTestSession, endTestSession, startTestSession } from './session.testing';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    clearTestSession();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    backend.verify();
    clearTestSession();
  });

  it('should not add an Authorization header: the session travels in the httpOnly cookie', () => {
    startTestSession();
    http.get('/api/usuarios').subscribe();
    const request = backend.expectOne('/api/usuarios');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush([]);
    endTestSession();
  });

  it('should close the session as expired when the server answers 401', () => {
    startTestSession();
    const store = TestBed.inject(SessionStore);
    http.get('/api/usuarios').subscribe({ error: () => undefined });
    backend.expectOne('/api/usuarios').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(store.isLoggedIn()).toBeFalse();
    expect(store.expired()).toBeTrue();
  });

  it('should keep the session when the 401 is a wrong current password or comes from another domain', () => {
    startTestSession();
    http.patch('/auth/change-password', {}).subscribe({ error: () => undefined });
    backend.expectOne('/auth/change-password').flush(null, { status: 401, statusText: 'Unauthorized' });
    http.get('https://otro-dominio.com/api/datos').subscribe({ error: () => undefined });
    backend.expectOne('https://otro-dominio.com/api/datos').flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(TestBed.inject(SessionStore).isLoggedIn()).toBeTrue();
    endTestSession();
  });

  it('should ask for the password change when the server says the password is temporary', () => {
    startTestSession();
    const store = TestBed.inject(SessionStore);
    http.get('/api/instrumento2').subscribe({ error: () => undefined });
    backend.expectOne('/api/instrumento2').flush(
      { statusCode: 403, path: '/api/instrumento2', message: { message: 'Debes cambiar tu contraseña temporal antes de continuar.', codigo: PASSWORD_CHANGE_REQUIRED } },
      { status: 403, statusText: 'Forbidden' }
    );
    expect(store.isLoggedIn()).toBeTrue();
    expect(store.mustChangePassword()).toBeTrue();

    // Un 403 de permisos normal no lo pide.
    store.passwordChanged();
    http.get('/usuario').subscribe({ error: () => undefined });
    backend.expectOne('/usuario').flush({ statusCode: 403, message: { message: 'Forbidden resource' } }, { status: 403, statusText: 'Forbidden' });
    expect(store.mustChangePassword()).toBeFalse();
    endTestSession();
  });
});
