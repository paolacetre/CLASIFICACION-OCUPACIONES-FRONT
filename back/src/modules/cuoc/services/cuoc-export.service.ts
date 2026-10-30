import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CuocOcupacionService } from './cuoc-ocupacion.service';
import { CuocHijosService } from './cuoc-hijos.service';
import { RedisCacheService } from '../../cache/redis-cache.service';

export type CuocExportTab = 'denominaciones' | 'funciones' | 'ocupaciones';
export type CuocExportFormato = 'xlsx' | 'csv';

export interface CuocExportFiltros {
  q?: string;
  nivel?: string;
  area?: string;
  estado?: string;
  codOcupacion?: string;
}

/** Sin límite de página real: alcanza para exportar el catálogo CUOC completo en una sola pasada. */
const LIMITE_EXPORTACION = 1_000_000;

/**
 * Genera los archivos Excel/CSV de la pantalla de consulta CUOC. Mismo patrón
 * que `CnoExportService`: reutiliza los métodos `consultar()`/`consultarDenominaciones()`/
 * `consultarFunciones()` que alimentan la tabla en pantalla.
 */
@Injectable()
export class CuocExportService {
  constructor(
    private readonly ocupacionService: CuocOcupacionService,
    private readonly hijosService: CuocHijosService,
    private readonly cache: RedisCacheService,
  ) {}

  generarArchivo(tab: CuocExportTab, formato: CuocExportFormato, filtros: CuocExportFiltros): Promise<Buffer> {
    const clave = `export:cuoc:${tab}:${formato}:${JSON.stringify(filtros, Object.keys(filtros).sort())}`;
    return this.cache.envolverBufferCatalogo(clave, async () => {
      const wb = XLSX.utils.book_new();
      const { nombre, filas } = await this.obtenerHoja(tab, filtros);
      const ws = XLSX.utils.json_to_sheet(filas);
      XLSX.utils.book_append_sheet(wb, ws, nombre);
      return this.serializar(wb, formato);
    });
  }

  generarBaseCompleta(): Promise<Buffer> {
    return this.cache.envolverBufferCatalogo('export:cuoc:todo', async () => {
      const wb = XLSX.utils.book_new();
      for (const tab of ['ocupaciones', 'denominaciones', 'funciones'] as CuocExportTab[]) {
        const { nombre, filas } = await this.obtenerHoja(tab, {});
        const ws = XLSX.utils.json_to_sheet(filas);
        XLSX.utils.book_append_sheet(wb, ws, nombre);
      }
      return this.serializar(wb, 'xlsx');
    });
  }

  private async obtenerHoja(
    tab: CuocExportTab,
    filtros: CuocExportFiltros,
  ): Promise<{ nombre: string; filas: Record<string, unknown>[] }> {
    if (tab === 'denominaciones') {
      const pagina = await this.hijosService.consultarDenominaciones({
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
          'Código Denominación': d.codDenominacion,
          'Denominación': d.nomDenominacion,
          'Estado': d.estado,
        })),
      };
    }

    if (tab === 'funciones') {
      const pagina = await this.hijosService.consultarFunciones({
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
          'Función': f.nomFuncionCuoc,
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
        'Código CUOC': o.codigo,
        'Ocupación': o.nombre,
        'Nivel de competencia': o.nivelCompetencia ?? '',
        'Área de cualificación': o.areaCualificacion ?? '',
        'Estado': o.estado,
        'Denominaciones': o.denominaciones,
        'Funciones': o.funciones,
        'Destrezas': o.destrezas,
        'Conocimientos': o.conocimientos,
      })),
    };
  }

  private serializar(wb: XLSX.WorkBook, formato: CuocExportFormato): Buffer {
    if (formato === 'csv') {
      const primeraHoja = wb.SheetNames[0];
      if (!primeraHoja) {
        throw new BadRequestException('No hay datos para exportar.');
      }
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[primeraHoja]);
      return Buffer.from('﻿' + csv, 'utf-8');
    }
    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  }
}
