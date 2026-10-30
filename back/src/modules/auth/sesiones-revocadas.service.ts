import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';

import { RedisCacheService } from '../cache/redis-cache.service';

/**
 * Tokens de sesión cerrados con «Cerrar sesión» antes de vencer.
 *
 * El JWT es autosuficiente: borrar la cookie no lo invalida, y una copia del
 * token seguía sirviendo hasta su vencimiento (24 h). Aquí se guarda la huella
 * (SHA-256, nunca el token) de cada token cerrado, solo mientras le quede vida,
 * así que no hay que limpiar nada ni tocar la base de datos.
 *
 * Se guarda en Redis, que comparten todas las instancias del backend, y además
 * en memoria: si Redis no está disponible, al menos esta instancia sigue
 * rechazando el token (la caché de Redis falla abierta para todo lo demás).
 */
@Injectable()
export class SesionesRevocadasService {
  private readonly enMemoria = new Map<string, number>();

  constructor(
    private readonly redis: RedisCacheService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Solo se revocan tokens con firma válida: si se aceptara cualquiera, alguien
   * podría llenar Redis mandando tokens inventados con vencimientos lejanos.
   */
  async revocar(token: string): Promise<void> {
    let exp: number | undefined;
    try {
      exp = (await this.jwt.verifyAsync<{ exp?: number }>(token)).exp;
    } catch {
      return; // vencido, alterado o ilegible: ya no sirve para nada
    }
    const restanteMs = exp ? exp * 1000 - Date.now() : 0;
    if (restanteMs <= 0) return;

    const ahora = Date.now();
    for (const [h, venceEn] of this.enMemoria) if (venceEn <= ahora) this.enMemoria.delete(h);

    const huella = this.huella(token);
    this.enMemoria.set(huella, ahora + restanteMs);
    await this.redis.marcar(this.clave(huella), restanteMs / 1000);
  }

  async estaRevocado(token: string): Promise<boolean> {
    const huella = this.huella(token);
    const venceEn = this.enMemoria.get(huella);
    if (venceEn !== undefined) {
      if (venceEn > Date.now()) return true;
      this.enMemoria.delete(huella);
    }
    return (await this.redis.existe(this.clave(huella))) === true;
  }

  private huella(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private clave(huella: string): string {
    return `sesion:revocada:${huella}`;
  }
}
