import { createHash, timingSafeEqual } from 'crypto';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';

/**
 * API keys para los sistemas externos que consultan el catálogo.
 *
 * Cada consumidor tiene su propia llave en el .env del backend; el otro
 * sistema la guarda en su propio .env y la envía en la cabecera `x-api-key`.
 * Una llave por consumidor permite revocar a uno sin afectar a los demás y
 * determina qué ve: la del APE recibe el campo ocupacional, la de Tendencias
 * no (CampoOcupacionalInterceptor), igual que sus usuarios con sesión.
 *
 *   API_KEY_BUSCADOR    Buscador de ocupaciones (solo /api/public/consulta/*)
 *   API_KEY_APE         Sistema de la APE (consultas CNO/CUOC/correlativa, rol APE)
 *   API_KEY_TENDENCIAS  Sistema de Tendencias (mismas consultas, rol TENDENCIAS_OCUPACIONES)
 *
 * Generar cada una con: openssl rand -hex 32
 */
export const CABECERA_API_KEY = 'x-api-key';

export type NombreConsumidor = 'buscador' | 'ape' | 'tendencias';

export interface ConsumidorApiKey {
  nombre: NombreConsumidor;
  /** Rol con que consulta las rutas internas; null = solo la API pública. */
  rol: Role | null;
}

const CONSUMIDORES: Array<{ variable: string } & ConsumidorApiKey> = [
  { variable: 'API_KEY_BUSCADOR', nombre: 'buscador', rol: null },
  { variable: 'API_KEY_APE', nombre: 'ape', rol: Role.APE },
  { variable: 'API_KEY_TENDENCIAS', nombre: 'tendencias', rol: Role.TENDENCIAS_OCUPACIONES },
];

/** Por debajo de esto una llave se puede adivinar; 64 hex = 256 bits. */
const LARGO_MINIMO = 32;

const logger = new Logger('ApiKey');
const huella = (valor: string) => createHash('sha256').update(valor, 'utf8').digest();

let cache: { firma: string; llaves: Array<{ digest: Buffer } & ConsumidorApiKey> } | null = null;

/** Llaves configuradas, leídas del entorno (se recalculan solo si el .env cambió). */
function llavesConfiguradas() {
  const valores = CONSUMIDORES.map((c) => (process.env[c.variable] ?? '').trim());
  const firma = valores.join('\u0000');
  if (cache?.firma === firma) return cache.llaves;

  const llaves = CONSUMIDORES.flatMap((c, i) => {
    const valor = valores[i];
    if (!valor) return [];
    if (valor.length < LARGO_MINIMO) {
      logger.error(`${c.variable} tiene menos de ${LARGO_MINIMO} caracteres y se ignora. Genere una con: openssl rand -hex 32`);
      return [];
    }
    return [{ digest: huella(valor), nombre: c.nombre, rol: c.rol }];
  });
  logger.log(`API keys activas: ${llaves.map((l) => l.nombre).join(', ') || 'ninguna'}.`);
  cache = { firma, llaves };
  return llaves;
}

/** Al arrancar: deja en el log qué consumidores tienen llave (nunca el valor) y avisa de las inválidas. */
export function registrarApiKeysAlArrancar(): void {
  cache = null;
  llavesConfiguradas();
}

/**
 * Consumidor dueño de la llave, o null si no corresponde a ninguna.
 * Se comparan las huellas SHA-256 en tiempo constante: comparar el texto
 * directamente dejaría adivinar la llave carácter por carácter midiendo cuánto
 * tarda la respuesta.
 */
export function resolverApiKey(valor: string | undefined): ConsumidorApiKey | null {
  if (!valor) return null;
  const digest = huella(valor.trim());
  let encontrado: ConsumidorApiKey | null = null;
  for (const llave of llavesConfiguradas()) {
    // Se recorren todas sin cortar al encontrar, para no filtrar cuál coincidió por tiempo.
    if (timingSafeEqual(digest, llave.digest)) encontrado = { nombre: llave.nombre, rol: llave.rol };
  }
  return encontrado;
}

export function apiKeyDe(req: { headers?: Record<string, unknown> }): string | undefined {
  const valor = req?.headers?.[CABECERA_API_KEY];
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

// ── Bloqueo por intentos fallidos ───────────────────────────────────────────
// Quien prueba llaves al azar queda bloqueado un rato: 10 llaves inválidas en
// 10 minutos desde la misma IP → 15 minutos sin poder consultar con API key.

const MAX_FALLOS = 10;
const VENTANA_MS = 10 * 60_000;
const BLOQUEO_MS = 15 * 60_000;
const fallos = new Map<string, { intentos: number; desde: number; bloqueadoHasta: number }>();

/** Lanza 429 con Retry-After si la IP está bloqueada. */
export function verificarBloqueo(ip: string, res?: { setHeader?: (k: string, v: string) => void }): void {
  const registro = fallos.get(ip);
  const ahora = Date.now();
  if (!registro || registro.bloqueadoHasta <= ahora) return;
  const segundos = Math.ceil((registro.bloqueadoHasta - ahora) / 1000);
  res?.setHeader?.('Retry-After', String(segundos));
  throw new HttpException(
    `Demasiados intentos con una API key inválida. Espere ${Math.ceil(segundos / 60)} minuto(s) antes de reintentar.`,
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

export function registrarFallo(ip: string): void {
  const ahora = Date.now();
  let registro = fallos.get(ip);
  if (!registro || ahora - registro.desde > VENTANA_MS) {
    registro = { intentos: 0, desde: ahora, bloqueadoHasta: 0 };
    fallos.set(ip, registro);
  }
  registro.intentos++;
  if (registro.intentos >= MAX_FALLOS) {
    registro.bloqueadoHasta = ahora + BLOQUEO_MS;
    logger.warn(`IP ${ip} bloqueada ${BLOQUEO_MS / 60_000} min por ${registro.intentos} API keys inválidas.`);
  }
  // Limpieza perezosa para que el mapa no crezca sin límite.
  if (fallos.size > 10_000) {
    for (const [k, v] of fallos) if (v.bloqueadoHasta <= ahora && ahora - v.desde > VENTANA_MS) fallos.delete(k);
  }
}

export function limpiarFallos(ip: string): void {
  fallos.delete(ip);
}
