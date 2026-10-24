import { Injectable, computed, signal } from '@angular/core';
import { PROJECT_STORAGE_PREFIX } from '../../proyecto/config';

/** Nombre de un rol del backend en el front (misma tabla que `ROLE_LABELS` de session.ts, que no se puede importar aquí sin ciclo). */
const ROLE_NAMES: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  ANALISTA: 'Analista',
  EXPERTO: 'Experto',
  CIUDADANO: 'Ciudadano',
  APE: 'APE',
  TENDENCIAS_OCUPACIONES: 'Tendencias ocupacionales'
};

/** Usuario con la sesión iniciada. `role` es el nombre del rol en el front: 'Administrador', 'Analista', 'Experto'… */
export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

/** Lo que dice el servidor de quien ingresó (`user` de `POST /auth/login` y `GET /auth/me`). */
export interface SessionAccount {
  id: number;
  name: string;
  email: string;
  /** Rol tal como lo guarda el backend: 'ADMINISTRADOR', 'ANALISTA'… */
  backendRole: string;
  /** La contraseña es temporal (la cédula): hasta cambiarla el servidor responde 403 a todo lo demás. */
  mustChangePassword: boolean;
}

/** Clave de almacenamiento (lleva el prefijo del proyecto): en sessionStorage, o en localStorage si se eligió "Mantener la sesión iniciada". */
export const SESSION_STORAGE_KEY = `${PROJECT_STORAGE_PREFIX}_session`;

/** Lo que se guarda en el navegador: quién ingresó y cuándo. El token no, porque JavaScript no lo puede leer. */
interface StoredSession {
  user: SessionUser;
  mustChangePassword: boolean;
  startedAt: number;
}

function removeSaved(): void {
  for (const storage of [sessionStorage, localStorage]) {
    storage.removeItem(SESSION_STORAGE_KEY);
  }
}

function isStoredSession(value: unknown): value is StoredSession {
  const stored = value as StoredSession | null;
  return typeof stored?.user?.id === 'number' && typeof stored.user.role === 'string' && typeof stored.startedAt === 'number';
}

/**
 * Sesión actual. El token lo guarda el servidor en una cookie httpOnly
 * (`olo_sesion`), que el navegador envía solo en cada llamada y que JavaScript
 * no puede leer: así un script ajeno no puede robarlo. Aquí solo se recuerda
 * quién ingresó, con qué rol y desde cuándo, para pintar la interfaz; los
 * permisos reales los decide siempre el servidor.
 *
 * Se conserva en sessionStorage (sobrevive a recargar la página y termina al
 * cerrar el navegador) o, con "Mantener la sesión iniciada", en localStorage.
 * El navegador no sabe cuándo vence la cookie: cuando el servidor responde 401
 * (vencida o revocada) el interceptor llama a `expire()` y `expired()` queda en
 * true para avisarlo en la pantalla de ingreso.
 *
 * No tiene dependencias, para que cualquier servicio pueda leerla (a través
 * del token `SESSION`) sin ciclos.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly userSignal = signal<SessionUser | null>(null);
  private readonly mustChangePasswordSignal = signal(false);
  private readonly startedAtSignal = signal<number | null>(null);
  private readonly expiredSignal = signal(false);

  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = computed(() => this.userSignal() !== null);
  /** La sesión está abierta con la contraseña temporal: solo se puede cambiarla o salir. */
  readonly mustChangePassword = this.mustChangePasswordSignal.asReadonly();
  /** Momento en que se inició la sesión (ms); `null` sin sesión. */
  readonly startedAt = this.startedAtSignal.asReadonly();
  /** La última sesión terminó porque el servidor la dio por vencida (no porque el usuario saliera). */
  readonly expired = this.expiredSignal.asReadonly();

  constructor() {
    const saved = this.read();
    if (saved) {
      this.userSignal.set(saved.user);
      this.mustChangePasswordSignal.set(saved.mustChangePassword);
      this.startedAtSignal.set(saved.startedAt);
    }
  }

  /** Abre la sesión con la cuenta que respondió el ingreso (`remember`: conservarla al cerrar el navegador). */
  start(account: SessionAccount, remember = false): void {
    this.userSignal.set(toSessionUser(account));
    this.mustChangePasswordSignal.set(account.mustChangePassword);
    this.startedAtSignal.set(Date.now());
    this.expiredSignal.set(false);
    try {
      removeSaved();
    } catch {
      // Sin almacenamiento disponible: la sesión dura mientras la página esté abierta.
    }
    this.save(remember ? localStorage : sessionStorage);
  }

  /** Pone al día la sesión con lo que dice el servidor ahora (`GET /auth/me`): nombre, rol y contraseña temporal. */
  refresh(account: SessionAccount): void {
    if (!this.isLoggedIn()) {
      return;
    }
    this.userSignal.set(toSessionUser(account));
    this.mustChangePasswordSignal.set(account.mustChangePassword);
    this.save();
  }

  /** Actualiza el nombre de quien tiene la sesión (cambió en su perfil). */
  rename(name: string): void {
    const user = this.userSignal();
    if (user) {
      this.userSignal.set({ ...user, name });
      this.save();
    }
  }

  /** El servidor respondió que la contraseña es temporal (403 `CAMBIO_CONTRASENA_REQUERIDO`). */
  requirePasswordChange(): void {
    if (this.isLoggedIn() && !this.mustChangePasswordSignal()) {
      this.mustChangePasswordSignal.set(true);
      this.save();
    }
  }

  /** La contraseña temporal ya se cambió: la sesión sigue con acceso normal. */
  passwordChanged(): void {
    if (this.mustChangePasswordSignal()) {
      this.mustChangePasswordSignal.set(false);
      this.save();
    }
  }

  /** Cierra la sesión (salida voluntaria). */
  clear(): void {
    this.end(false);
  }

  /** Cierra la sesión porque el servidor la rechazó (401: vencida, revocada o la cuenta se desactivó). */
  expire(): void {
    if (this.isLoggedIn()) {
      this.end(true);
    }
  }

  /** Olvida la sesión (memoria y almacenamiento). `expired` decide si el ingreso muestra "Tu sesión venció". */
  private end(expired: boolean): void {
    this.userSignal.set(null);
    this.mustChangePasswordSignal.set(false);
    this.startedAtSignal.set(null);
    this.expiredSignal.set(expired);
    try {
      removeSaved();
    } catch {
      // Sin almacenamiento disponible: no hay nada que borrar.
    }
  }

  /** Guarda la sesión en `storage` (por defecto, donde ya estaba). */
  private save(storage?: Storage): void {
    const user = this.userSignal();
    const startedAt = this.startedAtSignal();
    if (!user || startedAt === null) {
      return;
    }
    try {
      const target = storage ?? (localStorage.getItem(SESSION_STORAGE_KEY) ? localStorage : sessionStorage);
      const stored: StoredSession = { user, mustChangePassword: this.mustChangePasswordSignal(), startedAt };
      target.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Sin almacenamiento disponible: los cambios duran lo que dure la página.
    }
  }

  /** Sesión guardada al recargar la página; algo ilegible se descarta. */
  private read(): StoredSession | null {
    let raw: string | null;
    try {
      raw = sessionStorage.getItem(SESSION_STORAGE_KEY) ?? localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) {
      return null;
    }
    let stored: unknown = null;
    try {
      stored = JSON.parse(raw);
    } catch {
      // Se descarta abajo, como cualquier otra cosa que no sea una sesión.
    }
    if (!isStoredSession(stored)) {
      try {
        removeSaved();
      } catch {
        // Sin almacenamiento disponible: no hay nada que borrar.
      }
      return null;
    }
    return { ...stored, mustChangePassword: stored.mustChangePassword === true };
  }
}

function toSessionUser(account: SessionAccount): SessionUser {
  return {
    id: account.id,
    name: account.name || account.email,
    email: account.email,
    role: ROLE_NAMES[account.backendRole.toUpperCase()] ?? account.backendRole
  };
}
