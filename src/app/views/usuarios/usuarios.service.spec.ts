/// <reference types="jasmine" />

/*
 * UsuariosService real: qué pide al backend y cómo traduce sus respuestas.
 */
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SESSION } from '../../shared/session';
import { User } from './usuarios.model';
import {
  DOCUMENT_IN_USE,
  EMAIL_IN_USE,
  INVALID_IMPORT_FILE,
  INVALID_USER_DATA,
  USERNAME_IN_USE,
  USERS_FORBIDDEN,
  USER_NOT_FOUND,
  UserError,
  UsuariosService
} from './usuarios.service';

describe('UsuariosService', () => {
  let service: UsuariosService;
  let backend: HttpTestingController;

  function setup(role = 'Administrador'): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: UsuariosService, useClass: UsuariosService },
        { provide: SESSION, useValue: { role, email: 'admin@sena.edu.co' } },
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(UsuariosService);
    backend = TestBed.inject(HttpTestingController);
  }

  const admin = {
    idUsuario: 1,
    usuario: 'admin@sena.edu.co',
    nombreApellido: 'Administrador Sena',
    correo: 'admin@sena.edu.co',
    telefono: '3000000001',
    documento: '1000000001',
    debeCambiarContrasena: false,
    estado: 1,
    fechaCreacion: '2026-10-09',
    origen: 'MANUAL',
    rol: 'admin'
  };

  afterEach(() => {
    backend.verify();
  });

  it('should list the users with the role, status, ID number and date as the screen shows them', () => {
    setup();
    let users: User[] = [];
    service.list().subscribe((result) => (users = result));
    // El backend los entrega del más nuevo al más viejo: la lista sale por id.
    backend.expectOne('/usuario').flush([
      { idUsuario: 7, usuario: '1234567', nombreApellido: null, correo: 'jperez@correo.com', telefono: null, documento: '1234567', debeCambiarContrasena: true, estado: 1, fechaCreacion: '2026-01-05', origen: 'EXCEL', rol: 'citizen' },
      { idUsuario: 6, usuario: 'tendencias@sena.edu.co', nombreApellido: 'Tendencias Ocupaciones', correo: 'tendencias@sena.edu.co', telefono: null, documento: null, estado: 0, fechaCreacion: null, origen: 'SEED', rol: 'tendencias' },
      admin
    ]);

    expect(users[0]).toEqual({
      id: 1,
      name: 'Administrador Sena',
      username: 'admin@sena.edu.co',
      email: 'admin@sena.edu.co',
      document: '1000000001',
      phone: '3000000001',
      role: 'Administrador',
      status: 'Activo',
      origin: 'Manual',
      mustChangePassword: false,
      date: '09/10/2026',
      initials: 'AS'
    });
    expect(users[1]).toEqual(jasmine.objectContaining({ role: 'Tendencias ocupacionales', status: 'Inactivo', date: '', phone: '', document: '', origin: 'Manual' }));
    // Sin nombre se muestra su usuario de acceso (aquí, la cédula).
    expect(users[2]).toEqual(jasmine.objectContaining({ name: '1234567', email: 'jperez@correo.com', role: 'Ciudadano', origin: 'Excel', mustChangePassword: true }));
  });

  it('should create a user with its ID number and without password nor username, sending the backend role', () => {
    setup();
    let created: User | undefined;
    service.create({ name: 'Ana Ríos', email: 'ana@sena.edu.co', document: '1.193.847.562', phone: '3001234567', role: 'Experto' }).subscribe((user) => (created = user));
    const request = backend.expectOne('/usuario');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ nombreApellido: 'Ana Ríos', correo: 'ana@sena.edu.co', documento: '1193847562', telefono: '3001234567', rol: 'EXPERTO' });
    request.flush({ idUsuario: 8, usuario: 'ana@sena.edu.co', nombreApellido: 'Ana Ríos', correo: 'ana@sena.edu.co', telefono: '3001234567', documento: '1193847562', estado: 1, fechaCreacion: '2026-10-09T15:00:00.000Z', rol: 'expert' });

    expect(created).toEqual(jasmine.objectContaining({ id: 8, name: 'Ana Ríos', document: '1193847562', role: 'Experto', status: 'Activo', date: '09/10/2026' }));
    expect(created && 'password' in created).toBeFalse();
  });

  it('should update the name, email, ID number and phone (the role goes apart)', () => {
    setup();
    service.update(2, { name: 'Ana Ríos', email: 'ana@sena.edu.co', document: '1193847562', phone: '', role: 'APE' }).subscribe();
    const request = backend.expectOne('/usuario/2');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ nombreApellido: 'Ana Ríos', correo: 'ana@sena.edu.co', documento: '1193847562', telefono: '' });
    request.flush({ ...admin, idUsuario: 2 });
  });

  it('should change only the role from "Rol y permisos"', () => {
    setup();
    let saved: User | undefined;
    service.setRole(2, 'Tendencias ocupacionales').subscribe((user) => (saved = user));
    const request = backend.expectOne('/usuario/2');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ rol: 'TENDENCIAS_OCUPACIONES' });
    request.flush({ ...admin, idUsuario: 2, rol: 'tendencias' });
    expect(saved?.role).toBe('Tendencias ocupacionales');
  });

  it('should activate and deactivate with the state names of the backend', () => {
    setup();
    let saved: User | undefined;
    service.setStatus(2, 'Inactivo').subscribe((user) => (saved = user));
    const off = backend.expectOne('/usuario/2');
    expect(off.request.method).toBe('PATCH');
    expect(off.request.body).toEqual({ estado: 'inactive' });
    off.flush({ ...admin, idUsuario: 2, estado: 0 });
    expect(saved?.status).toBe('Inactivo');

    service.setStatus(2, 'Activo').subscribe();
    const on = backend.expectOne('/usuario/2');
    expect(on.request.body).toEqual({ estado: 'active' });
    on.flush({ ...admin, idUsuario: 2 });
  });

  it('should translate the refusals of the server into stable codes, keeping its message', () => {
    setup();
    const answers: [number, object, string][] = [
      [404, { message: { message: 'Usuario no encontrado' } }, USER_NOT_FOUND],
      [403, { message: { message: 'Forbidden resource' } }, USERS_FORBIDDEN],
      [400, { message: { message: 'El correo electrónico ya está registrado por otro usuario' } }, EMAIL_IN_USE],
      [400, { message: { message: 'La cédula ya está registrada por otro usuario' } }, DOCUMENT_IN_USE],
      [400, { message: { message: 'El usuario de acceso ya está en uso por otra cuenta' } }, USERNAME_IN_USE],
      [400, { message: { message: ['El teléfono debe tener entre 7 y 15 dígitos'] } }, INVALID_USER_DATA]
    ];
    for (const [status, body, code] of answers) {
      let error: UserError | undefined;
      service.setStatus(2, 'Activo').subscribe({ error: (e: UserError) => (error = e) });
      backend.expectOne('/usuario/2').flush(body, { status, statusText: 'Error' });
      expect(error?.message).toBe(code);
    }
    let invalid: UserError | undefined;
    service.setStatus(2, 'Activo').subscribe({ error: (e: UserError) => (invalid = e) });
    backend.expectOne('/usuario/2').flush({ message: { message: ['El teléfono debe tener entre 7 y 15 dígitos'] } }, { status: 400, statusText: 'Bad Request' });
    expect(invalid?.serverMessage).toBe('El teléfono debe tener entre 7 y 15 dígitos');
  });

  it('should download the import template', () => {
    setup();
    let blob: Blob | undefined;
    service.template().subscribe((value) => (blob = value));
    const request = backend.expectOne('/usuario/plantilla');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['x']));
    expect(blob?.size).toBe(1);
  });

  it('should upload the Excel in the field the server expects and report what was imported, with the warnings', () => {
    setup();
    const file = new File(['x'], 'usuarios.xlsx');
    let result: unknown;
    service.importExcel(file).subscribe((value) => (result = value));
    const request = backend.expectOne('/usuario/upload-excel');
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('file')).toEqual(file);
    request.flush({
      totales: 3,
      exitosos: 2,
      conContrasenaTemporal: 2,
      errores: [{ fila: 3, usuario: 'admin@sena.edu.co', mensaje: 'El usuario, correo o cédula ya está registrado' }],
      avisos: [{ fila: 2, usuario: 'ana@sena.edu.co', mensaje: 'El rol "Jefe" no es uno de los permitidos; se asignó CIUDADANO.' }]
    });
    expect(result).toEqual({
      total: 3,
      imported: 2,
      temporaryPasswords: 2,
      errors: [{ row: 3, user: 'admin@sena.edu.co', message: 'El usuario, correo o cédula ya está registrado' }],
      warnings: [{ row: 2, user: 'ana@sena.edu.co', message: 'El rol "Jefe" no es uno de los permitidos; se asignó CIUDADANO.' }]
    });

    let error = '';
    service.importExcel(file).subscribe({ error: (e: Error) => (error = e.message) });
    backend.expectOne('/usuario/upload-excel').flush({ message: { message: 'El archivo Excel no tiene hojas' } }, { status: 400, statusText: 'Bad Request' });
    expect(error).toBe(INVALID_IMPORT_FILE);
  });
});
