import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CnoOcupacionService } from './cno-ocupacion.service';
import { CnoDenominacionesService } from './cno-denominaciones.service';
import { CnoFuncionesService } from './cno-funciones.service';
import { RedisCacheService } from '../../cache/redis-cache.service';

export type CnoExportTab = 'denominaciones' | 'funciones' | 'ocupaciones';
export type CnoExportFormato = 'xlsx' | 'csv';

export interface CnoExportFiltros {
  q?: string;
  nivel?: string;
  area?: string;
  estado?: string;
  codOcupacion?: string;
}

/** Sin límite de página real: alcanza para exportar el catálogo CNO completo en una sola pasada. */
const LIMITE_EXPORTACION = 1_000_000;

/**
 * Genera los archivos Excel/CSV de la pantalla de consulta CNO. Reutiliza los
 * mismos métodos `consultar()` que alimentan la tabla en pantalla (para que
 * "descargar resultados filtrados" traiga exactamente lo que se ve filtrado,
 * sin paginar), y arma el workbook con `xlsx` — misma librería que ya usa
 * `CorrelativaService.generarExcelCompleto()`.
 */
@Injectable()
export class CnoExportService {
  constructor(
    private readonly ocupacionService: CnoOcupacionService,
    private readonly denominacionesService: CnoDenominacionesService,
    private readonly funcionesService: CnoFuncionesService,
    private readonly cache: RedisCacheService,
  ) {}

  /** Exporta la pestaña activa respetando los filtros de búsqueda actuales. */
  generarArchivo(tab: CnoExportTab, formato: CnoExportFormato, filtros: CnoExportFiltros): Promise<Buffer> {
    const clave = `export:cno:${tab}:${formato}:${JSON.stringify(filtros, Object.keys(filtros).sort())}`;
    return this.cache.envolverBufferCatalogo(clave, async () => {
      const wb = XLSX.utils.book_new();
      const { nombre, filas } = await this.obtenerHoja(tab, filtros);
      const ws = XLSX.utils.json_to_sheet(filas);
      XLSX.utils.book_append_sheet(wb, ws, nombre);
      return this.serializar(wb, formato);
    });
  }

  /** Exporta las 3 pestañas completas, sin filtros, en un solo libro. */
  generarBaseCompleta(): Promise<Buffer> {
    return this.cache.envolverBufferCatalogo('export:cno:todo', async () => {
      const wb = XLSX.utils.book_new();
      for (const tab of ['ocupaciones', 'denominaciones', 'funciones'] as CnoExportTab[]) {
        const { nombre, filas } = await this.obtenerHoja(tab, {});
        const ws = XLSX.utils.json_to_sheet(filas);
        XLSX.utils.book_append_sheet(wb, ws, nombre);
      }
      return this.serializar(wb, 'xlsx');
    });
  }

  private async obtenerHoja(
    tab: CnoExportTab,
    filtros: CnoExportFiltros,
  ): Promise<{ nombre: string; filas: Record<string, unknown>[] }> {
    if (tab === 'denominaciones') {
      const pagina = await this.denominacionesService.consultar({
        ...filtros,
        page: 1,
        limit: LIMITE_EXPORTACION,
        orden: 'descripcion',
        direccion: 'ASC',
      });
      return {
        nombre: 'Denominaciones',
        filas: pagina.data.map((d) => ({
          'Código Ocupación': d.codOcupacion,
          'Ocupación': d.nombOcupacion,
          'Código Denominación': d.codDenominacionCno,
          'Denominación': d.descDenominacion,
          'Estado': d.estado,
        })),
      };
    }

    if (tab === 'funciones') {
      const pagina = await this.funcionesService.consultar({
        ...filtros,
        page: 1,
        limit: LIMITE_EXPORTACION,
        orden: 'descripcion',
        direccion: 'ASC',
      });
      return {
        nombre: 'Funciones',
        filas: pagina.data.map((f) => ({
          'Código Ocupación': f.codOcupacion,
          'Ocupación': f.nombOcupacion,
          'Código Función': f.codigo,
          'Función': f.descFuncionCno,
          'Estado': f.estado,
        })),
      };
    }

    const pagina = await this.ocupacionService.consultar({
      q: filtros.q,
      nivel: filtros.nivel,
      area: filtros.area,
      estado: filtros.estado,
      page: 1,
      limit: LIMITE_EXPORTACION,
      orden: 'codigo',
      direccion: 'ASC',
    });
    return {
      nombre: 'Ocupaciones',
      filas: pagina.data.map((o) => ({
        'Código CNO': o.codigo,
        'Ocupación': o.nombre,
        'Código nivel de cualificación': o.codNivelCualificacion ?? '',
        'Nivel de cualificación': o.nivelCualificacion ?? '',
        'Área de desempeño': o.areaDesempeno ?? '',
        'Estado': o.estado,
        'Denominaciones': o.denominaciones,
        'Funciones': o.funciones,
        'Habilidades': o.habilidades,
        'Conocimientos': o.conocimientos,
      })),
    };
  }

  private serializar(wb: XLSX.WorkBook, formato: CnoExportFormato): Buffer {
    if (formato === 'csv') {
      // CSV no soporta múltiples hojas: se usa solo para exportaciones de una pestaña.
      const primeraHoja = wb.SheetNames[0];
      if (!primeraHoja) {
        throw new BadRequestException('No hay datos para exportar.');
      }
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[primeraHoja]);
      // BOM UTF-8: sin él, Excel en Windows interpreta mal las tildes/ñ del CSV.
      return Buffer.from('﻿' + csv, 'utf-8');
    }
    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  }
}
