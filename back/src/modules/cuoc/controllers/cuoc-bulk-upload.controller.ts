import {
  Controller,
  Post,
  Get,
  Res,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CuocBulkUploadService } from '../services/cuoc-bulk-upload.service';
import { CuocCargaValidacionService } from '../services/cuoc-carga-validacion.service';
import { CnoBulkUploadService } from '../../cno/services/cno-bulk-upload.service';
import { detectExcelType } from '../../shared/utils/detect-excel-type';
import { esTipoCargaCuoc, TIPOS_CARGA_CUOC } from '../config/cuoc-carga.config';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import {
  ESQUEMA_ARCHIVO_CON_MAPEO,
  OPCIONES_MULTER_EXCEL,
  exigirArchivoExcel,
  parsearMapeoManual,
} from '../../../common/utils/excel-archivo.util';
import { enviarPlantilla, exigirPlantilla, hojasPorNombre } from '../../../common/utils/plantilla-excel.util';
import { HOJAS_PLANTILLA_CUOC, HOJAS_POR_PLANTILLA_CUOC } from '../config/cuoc-plantilla.config';

@ApiTags('CUOC - Carga Masiva')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO)
@Controller('api/cuoc')
export class CuocBulkUploadController {
  private readonly logger = new Logger(CuocBulkUploadController.name);

  constructor(
    private readonly bulkUploadService: CuocBulkUploadService,
    private readonly validacionService: CuocCargaValidacionService,
    @Inject(forwardRef(() => CnoBulkUploadService))
    private readonly cnoBulkUploadService: CnoBulkUploadService,
  ) {}

  /**
   * Plantilla vacía con las hojas y columnas exactas que lee el cargue: una por
   * tipo, o «completa» con el libro entero (para «Cargar todo» y el buscador).
   */
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Get('upload/plantilla/:tipo')
  @ApiOperation({ summary: 'Descarga la plantilla Excel de un tipo de carga CUOC, o la completa' })
  @ApiParam({ name: 'tipo', enum: Object.keys(HOJAS_POR_PLANTILLA_CUOC) })
  @ApiResponse({ status: 200, description: 'Archivo .xlsx con solo los encabezados' })
  descargarPlantilla(@Param('tipo') tipo: string, @Res() res: Response): void {
    const plantilla = exigirPlantilla(tipo, HOJAS_POR_PLANTILLA_CUOC);
    const hojas = hojasPorNombre(HOJAS_PLANTILLA_CUOC, HOJAS_POR_PLANTILLA_CUOC[plantilla]);
    enviarPlantilla(res, hojas, `Plantilla_CUOC_${plantilla}.xlsx`);
  }

  /** Valida el archivo contra el tipo elegido SIN escribir nada en base de datos. */
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('upload/:tipo/validar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analiza un Excel CUOC y devuelve el informe de validación (no guarda nada)' })
  @ApiParam({ name: 'tipo', enum: TIPOS_CARGA_CUOC as unknown as string[] })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: ESQUEMA_ARCHIVO_CON_MAPEO })
  @ApiResponse({ status: 200, description: 'Informe de validación del archivo' })
  @UseInterceptors(FileInterceptor('file', OPCIONES_MULTER_EXCEL))
  validar(
    @Param('tipo') tipo: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('mapeoManual') mapeoManualRaw?: string,
  ) {
    const tipoCarga = this.exigirTipo(tipo);
    exigirArchivoExcel(file);
    const mapeoManual = parsearMapeoManual(mapeoManualRaw, this.logger);

    this.logger.log(`Validando archivo CUOC (${tipoCarga}): ${file.originalname}, ${file.size} bytes`);
    return this.validacionService.validar(file.buffer, tipoCarga, mapeoManual);
  }

  /** Carga definitiva de UN tipo. Se llama solo después de que el usuario confirma. */
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('upload/:tipo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Carga en base de datos un Excel CUOC del tipo indicado' })
  @ApiParam({ name: 'tipo', enum: TIPOS_CARGA_CUOC as unknown as string[] })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: ESQUEMA_ARCHIVO_CON_MAPEO })
  @ApiResponse({ status: 200, description: 'Archivo procesado' })
  @UseInterceptors(FileInterceptor('file', OPCIONES_MULTER_EXCEL))
  cargarPorTipo(
    @Param('tipo') tipo: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('mapeoManual') mapeoManualRaw?: string,
  ) {
    const tipoCarga = this.exigirTipo(tipo);
    exigirArchivoExcel(file);
    const mapeoManual = parsearMapeoManual(mapeoManualRaw, this.logger);

    this.logger.log(`Cargando archivo CUOC (${tipoCarga}): ${file.originalname}, ${file.size} bytes`);
    return this.bulkUploadService.procesarTipo(file.buffer, tipoCarga, mapeoManual);
  }

  private exigirTipo(tipo: string) {
    if (!esTipoCargaCuoc(tipo)) {
      throw new BadRequestException(
        `Tipo de carga inválido: "${tipo}". Valores permitidos: ${TIPOS_CARGA_CUOC.join(', ')}.`,
      );
    }
    return tipo;
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Carga masiva de ocupaciones CUOC desde archivo Excel' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Archivo Excel (.xlsx o .xls), máximo 50MB' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 200, description: 'Archivo procesado exitosamente' })
  @ApiResponse({ status: 400, description: 'Archivo inválido o no enviado' })
  @UseInterceptors(FileInterceptor('file', OPCIONES_MULTER_EXCEL))
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    exigirArchivoExcel(file);

    this.logger.log(`Recibido archivo CUOC: ${file.originalname}, tamaño: ${file.size} bytes`);
    
    const type = detectExcelType(file.buffer);
    console.log(`[Carga Masiva CUOC Controller] Tipo detectado para ${file.originalname}: ${type}`);
    if (type === 'CNO') {
      return this.cnoBulkUploadService.processExcel(file.buffer);
    }
    return this.bulkUploadService.processExcel(file.buffer);
  }
}
