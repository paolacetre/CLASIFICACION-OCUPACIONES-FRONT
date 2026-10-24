import { Injectable } from '@angular/core';
import { hashPassword, verifyPassword } from './mock-security';

/**
 * Tabla de contraseñas de la "base de datos" simulada: guarda solo el hash de
 * cada usuario (id → `sha256$sal$hash`), nunca la contraseña. Ningún endpoint
 * la devuelve; solo la usan `UsuariosService` (al crear o cambiar la
 * contraseña) y `AuthService` (al validar el ingreso). Con backend desaparece.
 */
@Injectable({ providedIn: 'root' })
export class MockCredentialsStore {
  /** Hashes de los usuarios de ejemplo (contraseñas de demostración en CLAUDE.md). */
  private readonly hashes = new Map<number, string>([
    [1, 'sha256$7f3a9c1e5b2d4f60a8e1c3b5d7f90213$31a523fb0c484d3ba67a2bc16c1c456a3532d970672e7c562fec02472064de58'],
    [2, 'sha256$c4e8a2f61b9d3e5a7c0f2b4d6e8a1c35$681643417ffa3c1b6c0b817d9590cf636ad897cbc069b36d164ea781754a4ce8']
  ]);

  set(userId: number, password: string): void {
    this.hashes.set(userId, hashPassword(password));
  }

  verify(userId: number, password: string): boolean {
    const stored = this.hashes.get(userId);
    return !!stored && verifyPassword(password, stored);
  }

  remove(userId: number): void {
    this.hashes.delete(userId);
  }
}
