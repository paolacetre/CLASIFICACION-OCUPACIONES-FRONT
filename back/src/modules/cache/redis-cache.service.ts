import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Clave del contador que versiona todo lo cacheado del catálogo CNO/CUOC/correlativa. */
const CLAVE_VERSION_CATALOGO = 'catalogo:version';

/**
 * Caché en Redis con dos garantías:
 *
 * 1. Falla abierta: si Redis no está (caído, sin configurar, en un equipo de
 *    desarrollo sin el contenedor), cada operación se resuelve como "no hay
 *    caché" y la petición va directo a PostgreSQL. La caché acelera; nunca
 *    puede tumbar la app. Por eso `enableOfflineQueue: false`: sin conexión
 *    los comandos fallan al instante en vez de quedarse esperando.
 *
 * 2. Invalidación por versión: las claves del catálogo llevan dentro el número
 *    de versión vigente. Invalidar es un solo `INCR` atómico; las claves
 *    viejas quedan inalcanzables y Redis las borra al vencer su TTL. Evita
 *    `KEYS`/`SCAN` (bloqueantes y lentos) y no hay que saber qué claves
 *    depende de qué tabla.
 */
@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis | null;
  readonly ttlPorDefecto: number;

  constructor(config: ConfigService) {
    const opciones = config.get('redis');
    this.ttlPorDefecto = opciones.ttlSeconds;

    if (!opciones.enabled) {
      this.client = null;
      this.logger.warn('Caché desactivada (CACHE_ENABLED=false): todas las lecturas van a PostgreSQL.');
      return;
    }

    this.client = new Redis({
      host: opciones.host,
      port: opciones.port,
      password: opciones.password,
      keyPrefix: opciones.keyPrefix,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      // Reintenta indefinidamente en segundo plano, espaciando hasta 10 s.
      retryStrategy: (intentos) => Math.min(intentos * 1000, 10_000),
    });

    let avisoCaida = false;
    this.client.on('ready', () => {
      avisoCaida = false;
      this.logger.log(`Redis conectado en ${opciones.host}:${opciones.port}.`);
      // Mientras Redis estuvo fuera, las escrituras no pudieron invalidar y
      // pudo haber cambios hechos por fuera de la API (migraciones, scripts).
      // Al (re)conectar se descarta todo lo anterior.
      void this.invalidarCatalogo();
    });
    this.client.on('error', (err) => {
      if (avisoCaida) return;
      avisoCaida = true;
      this.logger.warn(`Redis no disponible (${err.message}). Se sigue sin caché hasta que vuelva.`);
    });
  }

  get disponible(): boolean {
    return this.client?.status === 'ready';
  }

  async versionCatalogo(): Promise<string | null> {
    if (!this.disponible) return null;
    try {
      return (await this.client!.get(CLAVE_VERSION_CATALOGO)) ?? '0';
    } catch {
      return null;
    }
  }

  async invalidarCatalogo(): Promise<void> {
    if (!this.disponible) return;
    try {
      await this.client!.incr(CLAVE_VERSION_CATALOGO);
    } catch (err) {
      this.logger.warn(`No se pudo invalidar la caché del catálogo: ${(err as Error).message}`);
    }
  }

  async getJson<T>(clave: string): Promise<T | undefined> {
    if (!this.disponible) return undefined;
    try {
      const valor = await this.client!.get(clave);
      return valor === null ? undefined : (JSON.parse(valor) as T);
    } catch {
      return undefined;
    }
  }

  async setJson(clave: string, valor: unknown, ttlSegundos = this.ttlPorDefecto): Promise<void> {
    if (!this.disponible || valor === undefined) return;
    try {
      await this.client!.set(clave, JSON.stringify(valor), 'EX', ttlSegundos);
    } catch (err) {
      this.logger.warn(`No se pudo guardar en caché "${clave}": ${(err as Error).message}`);
    }
  }

  /** Marca una clave que se borra sola al vencer. false si Redis no está disponible. */
  async marcar(clave: string, ttlSegundos: number): Promise<boolean> {
    if (!this.disponible || ttlSegundos <= 0) return false;
    try {
      await this.client!.set(clave, '1', 'EX', Math.ceil(ttlSegundos));
      return true;
    } catch (err) {
      this.logger.warn(`No se pudo guardar "${clave}": ${(err as Error).message}`);
      return false;
    }
  }

  /** Si la clave existe; null si Redis no está disponible para saberlo. */
  async existe(clave: string): Promise<boolean | null> {
    if (!this.disponible) return null;
    try {
      return (await this.client!.exists(clave)) === 1;
    } catch {
      return null;
    }
  }

  /**
   * Devuelve el binario cacheado o lo genera con `generar` y lo guarda. Pensado
   * para los Excel exportados, que tardan segundos en armarse y no cambian
   * hasta que cambia el catálogo. La clave se versiona sola con el catálogo.
   */
  async envolverBufferCatalogo(
    clave: string,
    generar: () => Promise<Buffer>,
    ttlSegundos = this.ttlPorDefecto,
  ): Promise<Buffer> {
    const version = await this.versionCatalogo();
    if (version === null) return generar();

    const claveCompleta = `cat:${version}:${clave}`;
    try {
      const cacheado = await this.client!.getBuffer(claveCompleta);
      if (cacheado) return cacheado;
    } catch {
      return generar();
    }

    const buffer = await generar();
    try {
      await this.client!.set(claveCompleta, buffer, 'EX', ttlSegundos);
    } catch (err) {
      this.logger.warn(`No se pudo guardar en caché "${claveCompleta}": ${(err as Error).message}`);
    }
    return buffer;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
