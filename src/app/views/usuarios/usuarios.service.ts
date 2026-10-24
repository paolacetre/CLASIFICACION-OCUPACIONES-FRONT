import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, map, throwError } from 'rxjs';
import { text } from '../../shared/api/http-helpers';
import { serverMessageOf } from '../../shared/auth/auth.service';
import { initialsFrom } from '../../shared/format/initials';
import { backendRoleOf, roleLabel } from '../../shared/session';
import { User, UserDraft, UserImportError, UserImportResult, UserRole, UserStatus, normalizeDocument } from './usuarios.model';

/** Códigos de error estables (el componente los traduce). */
export const USER_NOT_FOUND = 'USER_NOT_FOUND';
/** El correo ya lo usa otra cuenta. */
export const EMAIL_IN_USE = 'EMAIL_IN_USE';
/** La cédula ya la usa otra cuenta. */
export const DOCUMENT_IN_USE = 'DOCUMENT_IN_USE';
/** El usuario de acceso (correo SENA o cédula) ya lo usa otra cuenta. */
export const USERNAME_IN_USE = 'USERNAME_IN_USE';
/** El servidor no aceptó los datos (correo mal escrito, cédula o teléfono inválidos, rol que no existe…); lleva su mensaje. */
export const INVALID_USER_DATA = 'INVALID_USER_DATA';
/** El servidor no pudo leer el archivo de usuarios (no es un Excel o no tiene hojas). */
export const INVALID_IMPORT_FILE = 'INVALID_IMPORT_FILE';
/** El backend no deja a este rol administrar usuarios. */
export const USERS_FORBIDDEN = 'USERS_FORBIDDEN';

/** Error de Usuarios: `message` es el código y `serverMessage` el texto del servidor, si lo dio. */
export class UserError extends Error {
  constructor(code: string, readonly serverMessage = '') {
    super(code);
  }
}

/** Lo que responde el backend por cada usuario. */
interface UsuarioDto {
  idUsuario: number;
  usuario: string | null;
  /** Nombre y apellido en un solo campo (`usuario.nombre_apellido`). */
  nombreApellido: string | null;
  correo: string | null;
  telefono: string | null;
  documento?: string | null;
  /** Solo viene en la lista. */
  debeCambiarContrasena?: boolean;
  /** 1 = activo, 0 = inactivo. */
  estado: number | null;
  /** YYYY-MM-DD (o fecha ISO recién creado). */
  fechaCreacion: string | null;
  /** Clave corta del rol: admin, analyst, expert, citizen, ape, tendencias. */
  rol: string | null;
  /** 'MANUAL', 'EXCEL' o 'SEED'; solo viene en la lista. */
  origen?: string | null;
}

/** Fila con problema de `POST /usuario/upload-excel`. */
interface ImportRowDto {
  fila?: number;
  usuario?: string;
  mensaje?: string;
}

/** Respuesta de `POST /usuario/upload-excel`. */
interface ImportDto {
  totales: number;
  exitosos: number;
  conContrasenaTemporal?: number;
  errores: ImportRowDto[] | null;
  avisos?: ImportRowDto[] | null;
}

/** Claves cortas con las que el backend responde el rol → rol del backend. */
const ROLE_BY_KEY: Record<string, string> = {
  admin: 'ADMINISTRADOR',
  analyst: 'ANALISTA',
  expert: 'EXPERTO',
  citizen: 'CIUDADANO',
  ape: 'APE',
  tendencias: 'TENDENCIAS_OCUPACIONES'
};

/** 'YYYY-MM-DD…' → 'DD/MM/YYYY' (sin convertir zona horaria); vacío si no hay fecha. */
function toDisplayDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function toUser(dto: UsuarioDto): User {
  const username = text(dto.usuario);
  const email = text(dto.correo) || username;
  const name = text(dto.nombreApellido).trim() || username.split('@')[0];
  const key = text(dto.rol).toLowerCase();
  return {
    id: dto.idUsuario,
    name,
    username,
    email,
    document: text(dto.documento),
    phone: text(dto.telefono),
    role: roleLabel(ROLE_BY_KEY[key] ?? text(dto.rol)),
    status: dto.estado === 1 ? 'Activo' : 'Inactivo',
    // Solo la lista trae el origen; una cuenta recién creada desde aquí es manual.
    origin: text(dto.origen).toUpperCase() === 'EXCEL' ? 'Excel' : 'Manual',
    mustChangePassword: dto.debeCambiarContrasena === true,
    date: toDisplayDate(dto.fechaCreacion),
    initials: initialsFrom(name)
  };
}

function toImportRows(rows: ImportRowDto[] | null | undefined): UserImportError[] {
  return (rows ?? []).map((item) => ({ row: item.fila ?? 0, user: text(item.usuario), message: text(item.mensaje) }));
}

/** Traduce la respuesta de error del backend a un código estable (con el mensaje del servidor). */
function toUserError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  if (error.status === 404) {
    return new UserError(USER_NOT_FOUND);
  }
  if (error.status === 403) {
    return new UserError(USERS_FORBIDDEN);
  }
  if (error.status === 400) {
    const message = serverMessageOf(error);
    if (/c[eé]dula ya est[aá] registrada/i.test(message)) {
      return new UserError(DOCUMENT_IN_USE, message);
    }
    if (/correo electr[oó]nico ya est[aá] registrado/i.test(message)) {
      return new UserError(EMAIL_IN_USE, message);
    }
    if (/usuario de acceso ya est[aá] en uso/i.test(message)) {
      return new UserError(USERNAME_IN_USE, message);
    }
    return new UserError(INVALID_USER_DATA, message);
  }
  return error;
}

/**
 * Usuarios del sistema, contra el backend (`/usuario`; la lista solo la ve el administrador).
 *
 * - Al crear no se envía contraseña ni usuario: la contraseña inicial es la
 *   cédula (la cuenta queda obligada a cambiarla al ingresar) y el usuario de
 *   acceso es el correo si es del SENA o, si no, la cédula.
 * - El backend no borra usuarios (su `DELETE` solo los desactiva): aquí se
 *   activan y desactivan con `setStatus()`.
 * - La contraseña después la cambia su dueño en Perfil (`PATCH /auth/change-password`).
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);

  /** GET /usuario — el backend los entrega del más nuevo al más viejo: se muestran por id (orden de creación). */
  list(): Observable<User[]> {
    return this.http.get<UsuarioDto[]>('/usuario').pipe(map((users) => users.map((user) => toUser(user)).sort((a, b) => a.id - b.id)));
  }

  /** POST /usuario — el servidor asigna el id, la fecha y el usuario de acceso, y usa la cédula como contraseña inicial. */
  create(draft: UserDraft): Observable<User> {
    return this.write(() =>
      this.http.post<UsuarioDto>('/usuario', {
        nombreApellido: draft.name,
        correo: draft.email,
        documento: normalizeDocument(draft.document),
        telefono: draft.phone,
        rol: backendRoleOf(draft.role)
      })
    );
  }

  /** PATCH /usuario/:id — nombre, correo, cédula y teléfono; el servidor recalcula el usuario de acceso. El rol va en `setRole()`. */
  update(id: number, draft: UserDraft): Observable<User> {
    return this.write(() =>
      this.http.patch<UsuarioDto>(`/usuario/${id}`, {
        nombreApellido: draft.name,
        correo: draft.email,
        documento: normalizeDocument(draft.document),
        telefono: draft.phone
      })
    );
  }

  /** PATCH /usuario/:id con `{ rol }`: el rol decide los permisos. */
  setRole(id: number, role: UserRole): Observable<User> {
    return this.write(() => this.http.patch<UsuarioDto>(`/usuario/${id}`, { rol: backendRoleOf(role) }));
  }

  /** PATCH /usuario/:id con `{ estado: 'active' | 'inactive' }`: una cuenta inactiva no puede ingresar. */
  setStatus(id: number, status: UserStatus): Observable<User> {
    return this.write(() => this.http.patch<UsuarioDto>(`/usuario/${id}`, { estado: status === 'Activo' ? 'active' : 'inactive' }));
  }

  /** GET /usuario/plantilla — el Excel vacío con las columnas que lee la importación. */
  template(): Observable<Blob> {
    return this.http.get('/usuario/plantilla', { responseType: 'blob' });
  }

  /** Llama al backend y traduce su respuesta (o su error). */
  private write(request: () => Observable<UsuarioDto>): Observable<User> {
    return defer(request).pipe(
      catchError((error: unknown) => throwError(() => toUserError(error))),
      map((user) => toUser(user))
    );
  }

  /**
   * POST /usuario/upload-excel (campo `file`). El servidor lee la primera hoja
   * (nombre y apellido, correo, cédula y rol; sin rol queda Ciudadano), crea las
   * cuentas con la cédula como contraseña temporal, se salta las que ya existen
   * y responde las filas rechazadas y las que entraron con un cambio.
   */
  importExcel(file: File): Observable<UserImportResult> {
    return defer(() => {
      const body = new FormData();
      body.append('file', file, file.name);
      return this.http.post<ImportDto>('/usuario/upload-excel', body);
    }).pipe(
      catchError((error: unknown) => {
        const translated = toUserError(error);
        const invalid = translated instanceof UserError && translated.message === INVALID_USER_DATA;
        return throwError(() => (invalid ? new UserError(INVALID_IMPORT_FILE, translated.serverMessage) : translated));
      }),
      map((dto) => ({
        total: dto.totales ?? 0,
        imported: dto.exitosos ?? 0,
        temporaryPasswords: dto.conContrasenaTemporal ?? 0,
        errors: toImportRows(dto.errores),
        warnings: toImportRows(dto.avisos)
      }))
    );
  }
}
