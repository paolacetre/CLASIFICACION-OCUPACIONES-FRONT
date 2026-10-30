import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CLAVE_SIEMBRA_CNO, SiembraCnoService } from './siembra-cno.service';

// El libro real: la prueba también confirma que viaja en el repo.
const LIBRO = join(__dirname, '..', '..', '..', 'database', 'siembra', 'cno.xlsx');
const HASH = createHash('sha256').update(readFileSync(LIBRO)).digest('hex');

function armar(opciones: { hashGuardado?: string; errores?: number; ilegibles?: number; lock?: boolean; flag?: string }) {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const runner = {
    connect: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) return [{ ok: opciones.lock ?? true }];
      return [];
    }),
  };
  const dataSource = {
    createQueryRunner: () => runner,
    query: jest.fn(async () => (opciones.hashGuardado ? [{ valor: { hash: opciones.hashGuardado, aplicadoEn: 'ayer' } }] : [])),
  };
  const bulkUpload = {
    processExcel: jest.fn(async () => ({
      message: 'ok',
      totalErrors: opciones.errores ?? 0,
      totalUnreadable: opciones.ilegibles ?? 0,
    })),
  };
  const cache = { invalidarCatalogo: jest.fn() };
  const config = { get: jest.fn(() => opciones.flag ?? 'true') };
  const servicio = new SiembraCnoService(dataSource as any, config as any, bulkUpload as any, cache as any);
  const guardado = () => queries.find((q) => q.sql.includes('INSERT INTO clasificacion.configuracion_sistema'));
  return { servicio, bulkUpload, cache, runner, guardado };
}

describe('SiembraCnoService', () => {
  it('aplica el libro cuando la BD tiene otra versión (o ninguna) y guarda su hash', async () => {
    const { servicio, bulkUpload, cache, guardado, runner } = armar({ hashGuardado: 'version-anterior' });
    await expect(servicio.sembrar()).resolves.toBe(true);
    expect(bulkUpload.processExcel).toHaveBeenCalledTimes(1);
    expect(cache.invalidarCatalogo).toHaveBeenCalled();
    const insert = guardado()!;
    expect(insert.params![0]).toBe(CLAVE_SIEMBRA_CNO);
    expect(JSON.parse(insert.params![1] as string).hash).toBe(HASH);
    expect(runner.release).toHaveBeenCalled();
  });

  it('no repite la carga si ese mismo libro ya se aplicó', async () => {
    const { servicio, bulkUpload } = armar({ hashGuardado: HASH });
    await expect(servicio.sembrar()).resolves.toBe(false);
    expect(bulkUpload.processExcel).not.toHaveBeenCalled();
  });

  it('con errores o filas ilegibles no la marca como aplicada (se reintenta al arrancar)', async () => {
    for (const fallo of [{ errores: 2 }, { ilegibles: 1 }]) {
      const { servicio, guardado } = armar(fallo);
      await expect(servicio.sembrar()).resolves.toBe(false);
      expect(guardado()).toBeUndefined();
    }
  });

  it('si otra réplica tiene el lock, no carga', async () => {
    const { servicio, bulkUpload } = armar({ lock: false });
    await expect(servicio.sembrar()).resolves.toBe(false);
    expect(bulkUpload.processExcel).not.toHaveBeenCalled();
  });

  it('SIEMBRA_CNO=false la desactiva', () => {
    const { servicio } = armar({ flag: 'false' });
    const sembrar = jest.spyOn(servicio, 'sembrar');
    servicio.onApplicationBootstrap();
    expect(sembrar).not.toHaveBeenCalled();
  });
});
