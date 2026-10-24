/// <reference types="jasmine" />

/*
 * PerfilService real: qué pide al backend y cómo traduce sus respuestas.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService, INVALID_NEW_PASSWORD, WRONG_CURRENT_PASSWORD } from '../../shared/auth/auth.service';
import { SESSION } from '../../shared/session';
import { ProfileData } from './perfil.model';
import { PROFILE_INVALID, PerfilService, ProfileError, descriptionStorageKey, photoStorageKey } from './perfil.service';

describe('PerfilService', () => {
  let service: PerfilService;
  let backend: HttpTestingController;

  function setup(role = 'Administrador'): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: PerfilService, useClass: PerfilService },
        { provide: AuthService, useClass: AuthService },
        { provide: SESSION, useValue: { role, email: 'admin@sena.edu.co' } },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(PerfilService);
    backend = TestBed.inject(HttpTestingController);
  }

  const me = { id: 1, email: 'admin@sena.edu.co', usuario: 'admin@sena.edu.co', nombreApellido: 'Administrador Sena', telefono: '3000000001', role: 'ADMINISTRADOR', debeCambiarContrasena: false };
  const cuenta = { email: 'admin@sena.edu.co', nombreApellido: 'Administrador Sena', telefono: '3000000001', descripcion: 'Analista ocupacional', avatar: 'data:image/png;base64,AAAA' };
  const usuario = { idUsuario: 1, nombreApellido: 'Administrador Sena', telefono: '3000000001', fechaCreacion: '2026-10-09' };

  afterEach(() => {
    backend.verify();
    localStorage.removeItem(photoStorageKey(1));
    localStorage.removeItem(descriptionStorageKey(1));
  });

  function read(account = cuenta): ProfileData | undefined {
    let profile: ProfileData | undefined;
    service.get().subscribe((result) => (profile = result));
    backend.expectOne('/auth/me').flush(me);
    backend.expectOne('/api/mi-cuenta/perfil').flush(account);
    backend.expectOne('/usuario/1').flush(usuario);
    return profile;
  }

  it('should read the profile of the session from the server, with its photo, description and join date', () => {
    setup();
    expect(read()).toEqual({
      id: 1,
      name: 'Administrador Sena',
      email: 'admin@sena.edu.co',
      phone: '3000000001',
      role: 'Administrador',
      entity: 'Servicio Nacional de Aprendizaje (SENA)',
      dateJoined: '09/10/2026',
      photoUrl: 'data:image/png;base64,AAAA',
      description: 'Analista ocupacional'
    });
  });

  it('should still show the photo and description kept in this browser by older versions while the server has none', () => {
    setup();
    localStorage.setItem(photoStorageKey(1), 'data:image/png;base64,LOCAL');
    localStorage.setItem(descriptionStorageKey(1), 'Descripción local');
    const profile = read({ ...cuenta, descripcion: '', avatar: null } as unknown as typeof cuenta);
    expect(profile?.photoUrl).toBe('data:image/png;base64,LOCAL');
    expect(profile?.description).toBe('Descripción local');
  });

  it('should still show the profile when the server does not let this role read its user record', () => {
    setup();
    let profile: ProfileData | undefined;
    service.get().subscribe((result) => (profile = result));
    backend.expectOne('/auth/me').flush({ ...me, role: 'EXPERTO' });
    backend.expectOne('/api/mi-cuenta/perfil').flush(cuenta);
    backend.expectOne('/usuario/1').flush({ statusCode: 403 }, { status: 403, statusText: 'Forbidden' });
    expect(profile?.role).toBe('Experto');
    expect(profile?.dateJoined).toBe('');
  });

  it('should save the name, phone, description and photo on the server, and forget what this browser kept', () => {
    setup();
    localStorage.setItem(photoStorageKey(1), 'data:image/png;base64,LOCAL');
    const profile = read()!;

    let saved: ProfileData | undefined;
    service.update({ ...profile, name: ' Ana Ríos ', phone: ' 3001234567 ', description: ' Analista ', photoUrl: 'data:image/png;base64,BBBB' }).subscribe((result) => (saved = result));
    const request = backend.expectOne('/api/mi-cuenta/perfil');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ nombreApellido: 'Ana Ríos', telefono: '3001234567', descripcion: 'Analista', avatar: 'data:image/png;base64,BBBB' });
    request.flush({ ...cuenta, nombreApellido: 'Ana Ríos', telefono: '3001234567', descripcion: 'Analista', avatar: 'data:image/png;base64,BBBB' });

    expect(saved).toEqual(jasmine.objectContaining({ name: 'Ana Ríos', phone: '3001234567', description: 'Analista', photoUrl: 'data:image/png;base64,BBBB', dateJoined: '09/10/2026' }));
    expect(localStorage.getItem(photoStorageKey(1))).toBeNull();

    // Sin foto, el servidor la quita (avatar: null).
    service.update({ ...profile, photoUrl: '' }).subscribe();
    const removal = backend.expectOne('/api/mi-cuenta/perfil');
    expect(removal.request.body.avatar).toBeNull();
    removal.flush({ ...cuenta, avatar: null });
  });

  it('should explain with the server message why it did not accept the profile', () => {
    setup();
    let error: ProfileError | undefined;
    service.update({ ...read()! }).subscribe({ error: (e: ProfileError) => (error = e) });
    backend
      .expectOne('/api/mi-cuenta/perfil')
      .flush({ statusCode: 400, message: { message: ['La imagen es demasiado grande (máximo 2 MB).'] } }, { status: 400, statusText: 'Bad Request' });
    expect(error?.message).toBe(PROFILE_INVALID);
    expect(error?.serverMessage).toBe('La imagen es demasiado grande (máximo 2 MB).');
  });

  it('should change the password through PATCH /auth/change-password and translate the server refusals', () => {
    setup();
    let done = false;
    service.changePassword('Actual*2026', 'Nueva*Clave2026').subscribe(() => (done = true));
    const request = backend.expectOne('/auth/change-password');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ currentPassword: 'Actual*2026', newPassword: 'Nueva*Clave2026' });
    request.flush({ message: 'Contraseña actualizada' });
    expect(done).toBeTrue();

    const errors: string[] = [];
    for (const status of [401, 400]) {
      service.changePassword('a', 'b').subscribe({ error: (e: Error) => errors.push(e.message) });
      backend.expectOne('/auth/change-password').flush({ statusCode: status }, { status, statusText: 'Error' });
    }
    expect(errors).toEqual([WRONG_CURRENT_PASSWORD, INVALID_NEW_PASSWORD]);
  });
});
