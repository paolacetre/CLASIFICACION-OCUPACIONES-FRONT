import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

import { CnoBulkUploadService } from '../cno/services/cno-bulk-upload.service';
import { RedisCacheService } from '../cache/redis-cache.service';

/** Clave en `configuracion_sistema` donde queda qué versión del libro se aplicó. */
export const CLAVE_SIEMBRA_CNO = 'siembra_cno';

/** Lock de Postgres para que, con varias réplicas, solo una aplique el libro. */
const SIEMBRA_CNO_LOCK_KEY = 815263402;

/** Ubicaciones del libro: `cwd` en el contenedor (/app) y en `npm run start:dev`; `__dirname` desde dist/. */
const RUTAS_LIBRO = [
  join(process.cwd(), 'database', 'siembra', 'cno.xlsx'),
  join(__dirname, '..', '..', '..', 'database', 'siembra', 'cno.xlsx'),
];

export interface EstadoSiembraCno {
  hash: string;
  archivo: string;
  aplicadoEn: string;
  resumen: string;
}

/**
 * Siembra del catálogo CNO desde el libro oficial `database/siembra/cno.xlsx`
 * (hoy, CNO_2026_10-09Actualizado).
 *
 * Se aplica UNA VEZ POR VERSIÓN del archivo, no solo con la BD vacía: guarda
 * el hash SHA-256 del libro en `configuracion_sistema` y, si el archivo
 * cambia, lo vuelve a aplicar en el siguiente arranque. Así un despliegue que
 * ya tiene datos (p. ej. con los niveles de cualificación anteriores) queda
 * con el libro nuevo sin que nadie lo suba a mano.
 *
 * Usa exactamente la carga de Actualización (`CnoBulkUploadService`), que
 * sincroniza por código: crea lo que falte y actualiza lo que cambió, pero
 * nunca borra (las copias de Análisis no se tocan). Si la carga termina con
 * errores o filas ilegibles NO se marca como aplicada y se reintenta en el
 * próximo arranque.
 *
 * Corre en segundo plano para no retrasar el arranque ni el healthcheck.
 * Se desactiva con SIEMBRA_CNO=false. Para actualizar el catálogo basta con
 * reemplazar `database/siembra/cno.xlsx` y desplegar.
 */
@Injectable()
export class SiembraCnoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SiembraCnoService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly bulkUpload: CnoBulkUploadService,
    private readonly cache: RedisCacheService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.configService.get<string>('SIEMBRA_CNO', 'true') !== 'true') {
      this.logger.log('Siembra del catálogo CNO desactivada (SIEMBRA_CNO != true)');
      return;
    }
    void this.sembrar();
  }

  /** Devuelve true si aplicó el libro en esta llamada. */
  async sembrar(): Promise<boolean> {
    const ruta = RUTAS_LIBRO.find((r) => existsSync(r));
    if (!ruta) {
      this.logger.warn('No se encontró database/siembra/cno.xlsx; no se siembra el catálogo CNO.');
      return false;
    }

    const buffer = readFileSync(ruta);
    const hash = createHash('sha256').update(buffer).digest('hex');

    // Lock de sesión con una conexión propia: la carga abre sus propias
    // transacciones por hoja, así que no puede ir dentro de una sola.
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      const [{ ok }] = await runner.query('SELECT pg_try_advisory_lock($1) AS ok', [SIEMBRA_CNO_LOCK_KEY]);
      if (!ok) {
        this.logger.log('Otra instancia está aplicando la siembra CNO; esta la omite.');
        return false;
      }
      try {
        const actual = await this.estado();
        if (actual?.hash === hash) {
          this.logger.log(`Catálogo CNO al día con el libro de siembra (aplicado ${actual.aplicadoEn}).`);
          return false;
        }

        this.logger.log(`Aplicando el libro de siembra CNO (${ruta})...`);
        const resultado = await this.bulkUpload.processExcel(buffer);
        await this.cache.invalidarCatalogo();

        if (resultado.totalErrors > 0 || resultado.totalUnreadable > 0) {
          this.logger.warn(`Siembra CNO incompleta; se reintentará en el próximo arranque. ${resultado.message}`);
          return false;
        }

        const estado: EstadoSiembraCno = {
          hash,
          archivo: 'database/siembra/cno.xlsx',
          aplicadoEn: new Date().toISOString(),
          resumen: resultado.message,
        };
        await runner.query(
          `INSERT INTO clasificacion.configuracion_sistema (clave, valor, idusuario, fecha_actualizacion)
           VALUES ($1, $2::jsonb, NULL, now())
           ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, idusuario = NULL, fecha_actualizacion = now()`,
          [CLAVE_SIEMBRA_CNO, JSON.stringify(estado)],
        );
        this.logger.log(`Siembra CNO aplicada. ${resultado.message}`);
        return true;
      } finally {
        await runner.query('SELECT pg_advisory_unlock($1)', [SIEMBRA_CNO_LOCK_KEY]);
      }
    } catch (error) {
      // Como la siembra de usuarios: si falla se registra, pero la API sigue
      // sirviendo con el catálogo que ya tenga la BD.
      this.logger.error(`No se pudo aplicar la siembra CNO: ${(error as Error).message}`);
      return false;
    } finally {
      await runner.release();
    }
  }

  private async estado(): Promise<EstadoSiembraCno | null> {
    const filas: Array<{ valor: EstadoSiembraCno }> = await this.dataSource.query(
      'SELECT valor FROM clasificacion.configuracion_sistema WHERE clave = $1',
      [CLAVE_SIEMBRA_CNO],
    );
    return filas[0]?.valor ?? null;
  }
}
