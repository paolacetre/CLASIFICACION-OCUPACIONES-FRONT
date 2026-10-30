import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CorrelativaService } from '../services/correlativa.service';
import { CorrelativaCargaService, TIPOS_CARGA, TipoCarga } from '../services/correlativa-carga.service';
import { GuardarCorrelativaOcupacionDto } from '../dto/guardar-correlativa-ocupacion.dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CacheCatalogo, SinCache } from '../../cache/cache-catalogo.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/jwt-payload.interface';
import { veCampoOcupacional } from '../../../common/interceptors/campo-ocupacional.interceptor';
import { exigirFirmaExcel } from '../../../common/utils/excel-archivo.util';
import { enviarPlantilla, exigirPlantilla } from '../../../common/utils/plantilla-excel.util';
import { PLANTILLAS_CORRELATIVA } from '../config/correlativa-plantilla.config';

@ApiTags('Correlativa')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo()
@Controller('api/correlativa')
export class CorrelativaController {
  constructor(
    private readonly correlativaService: CorrelativaService,
    private readonly cargaService: CorrelativaCargaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar las correlativas registradas entre ocupaciones CNO y CUOC (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de correlativas CNO-CUOC' })
  async getCorrelaciones(@Query() pagination: PaginationDto) {
    return this.correlativaService.getCorrelaciones(pagination);
  }

  @SinCache()
  @Get('exportar-excel')
  @ApiOperation({ summary: 'Exportar catálogo completo o de una ocupación en Excel (Ocupaciones, Denominaciones y Funciones CNO-CUOC)' })
  @ApiQuery({ name: 'ocupacion', required: false, description: 'Código de ocupación CNO o CUOC para filtrar' })
  async exportarExcelCompleto(
    @Res() res: Response,
    @CurrentUser() user: AuthenticatedUser,
    @Query('ocupacion') ocupacion?: string,
  ) {
    const buffer = await this.correlativaService.generarExcelCompleto(ocupacion, veCampoOcupacional(user));
    const fecha = new Date().toISOString().slice(0, 10);
    const nombreArchivo = ocupacion
      ? `Correlativa_CNO_CUOC_Ocupacion_${ocupacion}_${fecha}.xlsx`
      : `Correlativa_CNO_CUOC_Completo_${fecha}.xlsx`;

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('conocimientos')
  async getCorrelacionesConocimientos() {
    return this.correlativaService.getCorrelacionesConocimientos();
  }

  @Get('ocupaciones')
  @ApiOperation({ summary: 'Listar la correlativa CNO-CUOC a nivel de ocupación' })
  @ApiQuery({ name: 'cno', required: false, description: 'Devuelve solo la correlativa de esa ocupación CNO' })
  @ApiQuery({ name: 'cuoc', required: false, description: 'Devuelve solo la correlativa de esa ocupación CUOC' })
  async getCorrelacionesOcupaciones(@Query('cno') cno?: string, @Query('cuoc') cuoc?: string) {
    return this.cargaService.listarOcupaciones({ cno, cuoc });
  }

  /**
   * Guarda la correlativa de una ocupación CNO. Reemplaza las CUOC que tuviera
   * esa CNO, así que sirve igual para crear que para editar.
   */
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('ocupaciones')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar la correlativa CNO-CUOC de una ocupación CNO' })
  @ApiBody({ type: GuardarCorrelativaOcupacionDto })
  @ApiResponse({ status: 200, description: 'Correlativa guardada' })
  @ApiResponse({ status: 400, description: 'Códigos ausentes o que no existen en los catálogos' })
  async guardarCorrelacionOcupacion(@Body() dto: GuardarCorrelativaOcupacionDto) {
    return this.cargaService.guardarOcupaciones(dto);
  }

  /** Plantilla vacía con las columnas exactas que reconoce la carga de ese tipo. */
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @SinCache()
  @Get('upload/plantilla/:tipo')
  @ApiOperation({ summary: 'Descarga la plantilla Excel de un tipo de correlativa' })
  @ApiParam({ name: 'tipo', enum: TIPOS_CARGA })
  @ApiResponse({ status: 200, description: 'Archivo .xlsx con solo los encabezados' })
  descargarPlantilla(@Param('tipo') tipo: string, @Res() res: Response): void {
    const plantilla = exigirPlantilla(tipo, PLANTILLAS_CORRELATIVA);
    enviarPlantilla(res, [PLANTILLAS_CORRELATIVA[plantilla]], `Plantilla_Correlativa_${plantilla}.xlsx`);
  }

  /**
   * Carga de UN tipo de correlativa desde su propio Excel. El tipo va en la
   * ruta para que el backend valide el archivo contra ese tipo y escriba solo
   * en su tabla; nunca mezcla denominación, ocupación y conocimiento.
   */
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('upload/:tipo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Carga masiva de correlativas de un tipo (denominacion | ocupacion | conocimiento)' })
  @ApiParam({ name: 'tipo', enum: TIPOS_CARGA })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Archivo Excel (.xlsx o .xls) del tipo indicado, máximo 50MB' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 200, description: 'Archivo procesado; la tabla del tipo quedó reemplazada' })
  @ApiResponse({ status: 400, description: 'Archivo ausente, de otro tipo, o sin filas válidas' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadPorTipo(@Param('tipo') tipo: string, @UploadedFile() file: Express.Multer.File) {
    if (!TIPOS_CARGA.includes(tipo as TipoCarga)) {
      throw new BadRequestException(`Tipo de carga no reconocido: '${tipo}'. Use denominacion, ocupacion o conocimiento.`);
    }
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }
    exigirFirmaExcel(file.buffer);
    return this.cargaService.cargar(file.buffer, tipo as TipoCarga);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Carga masiva de correlativas CNO-CUOC desde archivo Excel' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Archivo Excel (.xlsx o .xls) de correlativas, máximo 50MB' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 200, description: 'Archivo procesado exitosamente' })
  @ApiResponse({ status: 400, description: 'Archivo inválido, no enviado o con errores de procesamiento' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }
    exigirFirmaExcel(file.buffer);
    try {
      return await this.correlativaService.processExcel(file.buffer);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }
}
