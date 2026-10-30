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
import { CnoBulkUploadService } from '../services/cno-bulk-upload.service';
import { CnoCargaValidacionService } from '../services/cno-carga-validacion.service';
import { CuocBulkUploadService } from '../../cuoc/services/cuoc-bulk-upload.service';
import { detectExcelType } from '../../shared/utils/detect-excel-type';
import { esTipoCargaCno, TIPOS_CARGA_CNO } from '../config/cno-carga.config';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import {
  ESQUEMA_ARCHIVO_CON_MAPEO,
  OPCIONES_MULTER_EXCEL,
  exigirArchivoExcel,
  parsearMapeoManual,
} from '../../../common/utils/excel-archivo.util';
import { enviarPlantilla, exigirPlantilla, hojasPorNombre } from '../../../common/utils/plantilla-excel.util';
import { HOJAS_PLANTILLA_CNO, HOJAS_POR_PLANTILLA_CNO } from '../config/cno-plantilla.config';

@ApiTags('CNO - Carga Masiva')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO)
@Controller('api/cno')
export class CnoBulkUploadController {
  private readonly logger = new Logger(CnoBulkUploadController.name);

  constructor(
    private readonly bulkUploadService: CnoBulkUploadService,
    private readonly validacionService: CnoCargaValidacionService,
    @Inject(forwardRef(() => CuocBulkUploadService))
    private readonly cuocBulkUploadService: CuocBulkUploadService,
  ) {}

  /**
   * Plantilla vacía con las hojas y columnas exactas que lee el cargue: una por
   * tipo, o «completa» con el libro entero (para «Cargar todo» y el buscador).
   */
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Get('upload/plantilla/:tipo')
  @ApiOperation({ summary: 'Descarga la plantilla Excel de un tipo de carga CNO, o la completa' })
  @ApiParam({ name: 'tipo', enum: Object.keys(HOJAS_POR_PLANTILLA_CNO) })
  @ApiResponse({ status: 200, description: 'Archivo .xlsx con solo los encabezados' })
  descargarPlantilla(@Param('tipo') tipo: string, @Res() res: Response): void {
    const plantilla = exigirPlantilla(tipo, HOJAS_POR_PLANTILLA_CNO);
    const hojas = hojasPorNombre(HOJAS_PLANTILLA_CNO, HOJAS_POR_PLANTILLA_CNO[plantilla]);
    enviarPlantilla(res, hojas, `Plantilla_CNO_${plantilla}.xlsx`);
  }

  /** Valida el archivo contra el tipo elegido SIN escribir nada en base de datos. */
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('upload/:tipo/validar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analiza un Excel CNO y devuelve el informe de validación (no guarda nada)' })
  @ApiParam({ name: 'tipo', enum: TIPOS_CARGA_CNO as unknown as string[] })
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

    this.logger.log(`Validando archivo CNO (${tipoCarga}): ${file.originalname}, ${file.size} bytes`);
    return this.validacionService.validar(file.buffer, tipoCarga, mapeoManual);
  }

  /** Carga definitiva de UN tipo. Se llama solo después de que el usuario confirma. */
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('upload/:tipo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Carga en base de datos un Excel CNO del tipo indicado' })
  @ApiParam({ name: 'tipo', enum: TIPOS_CARGA_CNO as unknown as string[] })
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

    this.logger.log(`Cargando archivo CNO (${tipoCarga}): ${file.originalname}, ${file.size} bytes`);
    return this.bulkUploadService.procesarTipo(file.buffer, tipoCarga, mapeoManual);
  }

  private exigirTipo(tipo: string) {
    if (!esTipoCargaCno(tipo)) {
      throw new BadRequestException(
        `Tipo de carga inválido: "${tipo}". Valores permitidos: ${TIPOS_CARGA_CNO.join(', ')}.`,
      );
    }
    return tipo;
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Carga masiva de ocupaciones CNO desde archivo Excel' })
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

    const type = detectExcelType(file.buffer);
    console.log(`[Carga Masiva CNO Controller] Tipo detectado para ${file.originalname}: ${type}`);
    if (type === 'CUOC') {
      return this.cuocBulkUploadService.processExcel(file.buffer);
    }
    return this.bulkUploadService.processExcel(file.buffer);
  }
}
