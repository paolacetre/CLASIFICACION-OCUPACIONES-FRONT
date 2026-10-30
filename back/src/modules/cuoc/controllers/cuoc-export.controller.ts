import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CuocExportService, CuocExportTab, CuocExportFormato } from '../services/cuoc-export.service';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';

const TABS_VALIDOS: CuocExportTab[] = ['denominaciones', 'funciones', 'ocupaciones'];
const FORMATOS_VALIDOS: CuocExportFormato[] = ['xlsx', 'csv'];

const CONTENT_TYPE: Record<CuocExportFormato, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

@ApiTags('CUOC - Exportación')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@Controller('api/cuoc/export')
export class CuocExportController {
  constructor(private readonly exportService: CuocExportService) {}

  @Get()
  @ApiOperation({ summary: 'Exportar la pestaña activa de la consulta CUOC (respeta los filtros actuales)' })
  @ApiQuery({ name: 'tab', enum: TABS_VALIDOS })
  @ApiQuery({ name: 'formato', enum: FORMATOS_VALIDOS, required: false })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'nivel', required: false })
  @ApiQuery({ name: 'area', required: false })
  @ApiQuery({ name: 'estado', required: false })
  @ApiQuery({ name: 'codOcupacion', required: false })
  async exportar(
    @Res() res: Response,
    @Query('tab') tab: string,
    @Query('formato') formatoRaw = 'xlsx',
    @Query('q') q?: string,
    @Query('nivel') nivel?: string,
    @Query('area') area?: string,
    @Query('estado') estado?: string,
    @Query('codOcupacion') codOcupacion?: string,
  ) {
    if (!TABS_VALIDOS.includes(tab as CuocExportTab)) {
      throw new BadRequestException(`Pestaña no reconocida: '${tab}'. Use denominaciones, funciones u ocupaciones.`);
    }
    const formato = formatoRaw.toLowerCase() as CuocExportFormato;
    if (!FORMATOS_VALIDOS.includes(formato)) {
      throw new BadRequestException(`Formato no reconocido: '${formatoRaw}'. Use xlsx o csv.`);
    }

    const buffer = await this.exportService.generarArchivo(tab as CuocExportTab, formato, {
      q,
      nivel,
      area,
      estado,
      codOcupacion,
    });

    const fecha = new Date().toISOString().slice(0, 10);
    const nombreArchivo = `CUOC_${tab}_${fecha}.${formato}`;

    res.set({
      'Content-Type': CONTENT_TYPE[formato],
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('todo')
  @ApiOperation({ summary: 'Exportar la base completa de CUOC (Ocupaciones, Denominaciones y Funciones) sin filtros' })
  async exportarTodo(@Res() res: Response) {
    const buffer = await this.exportService.generarBaseCompleta();
    const fecha = new Date().toISOString().slice(0, 10);
    const nombreArchivo = `CUOC_Completo_${fecha}.xlsx`;

    res.set({
      'Content-Type': CONTENT_TYPE.xlsx,
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
