import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MOCK_LATENCY_MS, clone, mockResponse } from '../../shared/api/mock-api';
import { MockCredentialsStore } from '../../shared/api/mock-credentials';
import { initialsFrom } from '../../shared/format/initials';
import { todayAsStored } from '../../shared/format/today';
import { User, UserDraft, UserImportResult, UserRole, UserStatus, accessUsernameOf, normalizeDocument } from './usuarios.model';
import { DOCUMENT_IN_USE, EMAIL_IN_USE, USER_NOT_FOUND, UserError, UsuariosService } from './usuarios.service';

/** Usuarios de prueba. Sin contraseñas: sus hashes están en `MockCredentialsStore`. Devuelve copias nuevas. */
export function createTestUsers(): User[] {
  return [
    {
      id: 1, name: 'SENA Admin', username: 'admin@sena.edu.co', email: 'admin@sena.edu.co', document: '1000000001', phone: '3000000001',
      role: 'Administrador', status: 'Activo', origin: 'Manual', mustChangePassword: false, date: '24/08/2026', initials: 'SA'
    },
    {
      id: 2, name: 'Analista TDO', username: 'analista@sena.edu.co', email: 'analista@sena.edu.co', document: '', phone: '',
      role: 'Analista', status: 'Activo', origin: 'Manual', mustChangePassword: false, date: '24/08/2026', initials: 'AT'
    }
  ];
}

/** Plantilla de importación de prueba (un Excel vacío). */
const TEMPLATE_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Solo para pruebas: doble de `UsuariosService` en memoria, con las mismas
 * reglas que el backend (correo y cédula únicos, estado activo al crear, la
 * cédula como contraseña inicial). Guarda el hash de la contraseña en el
 * almacén con el que ingresa `FakeAuthService`.
 */
@Injectable()
export class FakeUsuariosService implements Pick<UsuariosService, keyof UsuariosService> {
  private readonly credentials = inject(MockCredentialsStore);

  private users: User[] = createTestUsers();

  list(): Observable<User[]> {
    return mockResponse(() => clone(this.users));
  }

  create(draft: UserDraft): Observable<User> {
    return mockResponse(() => {
      this.assertFree(draft, null);
      const document = normalizeDocument(draft.document);
      const user: User = {
        id: this.users.reduce((max, item) => Math.max(max, item.id), 0) + 1,
        name: draft.name,
        username: accessUsernameOf(draft.email, document),
        email: draft.email,
        document,
        phone: draft.phone,
        role: draft.role,
        status: 'Activo',
        origin: 'Manual',
        mustChangePassword: true,
        date: todayAsStored(),
        initials: initialsFrom(draft.name)
      };
      this.users = [...this.users, user];
      this.credentials.set(user.id, document);
      return clone(user);
    }, MOCK_LATENCY_MS);
  }

  update(id: number, draft: UserDraft): Observable<User> {
    return mockResponse(() => {
      const user = this.find(id);
      this.assertFree(draft, id);
      const document = normalizeDocument(draft.document);
      Object.assign(user, {
        name: draft.name,
        email: draft.email,
        document,
        phone: draft.phone,
        initials: initialsFrom(draft.name),
        username: accessUsernameOf(draft.email, document)
      });
      return clone(user);
    }, MOCK_LATENCY_MS);
  }

  setStatus(id: number, status: UserStatus): Observable<User> {
    return mockResponse(() => {
      const user = this.find(id);
      user.status = status;
      return clone(user);
    }, MOCK_LATENCY_MS);
  }

  setRole(id: number, role: UserRole): Observable<User> {
    return mockResponse(() => {
      const user = this.find(id);
      user.role = role;
      return clone(user);
    }, MOCK_LATENCY_MS);
  }

  template(): Observable<Blob> {
    return mockResponse(() => new Blob([], { type: TEMPLATE_TYPE }), MOCK_LATENCY_MS);
  }

  /** Importa una cuenta de ejemplo y rechaza otra que ya existe, como haría el servidor con un Excel de dos filas. */
  importExcel(_file: File): Observable<UserImportResult> {
    return mockResponse(() => {
      const user: User = {
        id: this.users.reduce((max, item) => Math.max(max, item.id), 0) + 1,
        name: 'Importada Excel',
        username: 'importada@sena.edu.co',
        email: 'importada@sena.edu.co',
        document: '1000000003',
        phone: '',
        role: 'Ciudadano',
        status: 'Activo',
        origin: 'Excel',
        mustChangePassword: true,
        date: todayAsStored(),
        initials: 'IE'
      };
      this.users = [...this.users, user];
      return {
        total: 2,
        imported: 1,
        temporaryPasswords: 1,
        errors: [{ row: 2, user: 'admin@sena.edu.co', message: 'El usuario, correo o cédula ya está registrado' }],
        warnings: []
      };
    }, MOCK_LATENCY_MS);
  }

  private find(id: number): User {
    const user = this.users.find((item) => item.id === id);
    if (!user) {
      throw new UserError(USER_NOT_FOUND);
    }
    return user;
  }

  private assertFree(draft: UserDraft, ownId: number | null): void {
    const others = this.users.filter((item) => item.id !== ownId);
    if (others.some((item) => item.email.toLowerCase() === draft.email.toLowerCase())) {
      throw new UserError(EMAIL_IN_USE);
    }
    const document = normalizeDocument(draft.document);
    if (document && others.some((item) => item.document === document)) {
      throw new UserError(DOCUMENT_IN_USE);
    }
  }
}
