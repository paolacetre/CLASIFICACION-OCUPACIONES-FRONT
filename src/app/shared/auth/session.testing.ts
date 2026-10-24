import { TestBed } from '@angular/core/testing';
import { backendRoleOf } from '../session';
import { SESSION_STORAGE_KEY, SessionAccount, SessionStore, SessionUser } from './session.store';

/** Sesión de ejemplo del administrador (el usuario 1 de los datos de prueba). */
export const TEST_ADMIN: SessionUser = { id: 1, name: 'SENA Admin', email: 'admin@sena.edu.co', role: 'Administrador' };

/** Solo para pruebas: la cuenta que respondería el servidor para `user`. */
export function testAccount(user: SessionUser = TEST_ADMIN, mustChangePassword = false): SessionAccount {
  return { id: user.id, name: user.name, email: user.email, backendRole: backendRoleOf(user.role), mustChangePassword };
}

/** Solo para pruebas: abre una sesión sin pasar por la pantalla de ingreso. Llamar antes de crear el componente. */
export function startTestSession(user: SessionUser = TEST_ADMIN, mustChangePassword = false): void {
  TestBed.inject(SessionStore).start(testAccount(user, mustChangePassword));
}

/** Solo para pruebas: borra la sesión guardada para que no pase de una prueba a otra (se puede llamar antes de configurar TestBed). */
export function clearTestSession(): void {
  for (const storage of [sessionStorage, localStorage]) {
    storage.removeItem(SESSION_STORAGE_KEY);
  }
}

/** Solo para pruebas: cierra la sesión abierta en esta prueba. */
export function endTestSession(): void {
  TestBed.inject(SessionStore).clear();
}
