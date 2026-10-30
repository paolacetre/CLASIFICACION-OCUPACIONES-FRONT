import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ConsultaService } from './consulta.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { Role } from '../../common/enums/role.enum';
import { CacheCatalogo } from '../cache/cache-catalogo.decorator';
import { OPCIONES_MULTER_EXCEL, exigirArchivoExcel } from '../../common/utils/excel-archivo.util';

@ApiTags('Consulta - Búsqueda unificada CNO/CUOC')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo()
@Controller('api/consulta')
export class ConsultaController {
  constructor(private readonly consultaService: ConsultaService) {}

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Carga masiva de ocupaciones CNO o CUOC desde Excel',
    description: 'Detecta automáticamente si el Excel es de tipo CNO o CUOC y lo procesa en la base de datos.',
  })
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
  @UseInterceptors(FileInterceptor('file', OPCIONES_MULTER_EXCEL))
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    exigirArchivoExcel(file);
    return this.consultaService.uploadExcel(file.buffer);
  }

  @Get('buscar/:codigo')
  @ApiOperation({
    summary: 'Buscar ocupación por código (CNO o CUOC)',
    description: 'Detecta automáticamente si el código es CNO (4 dígitos) o CUOC (5 dígitos) y devuelve todos los datos relacionados.',
  })
  @ApiParam({ name: 'codigo', example: '2111', description: 'Código de la ocupación (4 dígitos = CNO, 5 dígitos = CUOC)' })
  @ApiResponse({ status: 200, description: 'Ocupación encontrada con todos sus datos relacionados' })
  @ApiResponse({ status: 404, description: 'Ocupación no encontrada' })
  async buscarPorCodigo(@Param('codigo') codigo: string) {
    return this.consultaService.buscarPorCodigo(codigo);
  }

  @Post('buscar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Buscar múltiples ocupaciones por códigos',
    description: 'Acepta un array de códigos, detecta automáticamente CNO vs CUOC y devuelve todos los datos relacionados.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        codigos: {
          type: 'array',
          items: { type: 'string' },
          example: ['2111', '231201'],
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Resultado de la búsqueda múltiple con aciertos y errores por código' })
  @ApiResponse({ status: 400, description: 'Debe enviar un array de códigos en el campo "codigos"' })
  async buscarMultiples(@Body() body: { codigos: string[] }) {
    if (!body.codigos || !Array.isArray(body.codigos) || body.codigos.length === 0) {
      throw new BadRequestException('Debe enviar un array de códigos en el campo "codigos"');
    }
    if (body.codigos.length > 100) {
      throw new BadRequestException('El array "codigos" admite un máximo de 100 elementos por solicitud');
    }

    const resultados = [];
    const errores = [];

    for (const codigo of body.codigos) {
      try {
        const resultado = await this.consultaService.buscarPorCodigo(codigo);
        resultados.push(resultado);
      } catch (err) {
        errores.push({ codigo, error: err.message });
      }
    }

    return {
      total: resultados.length,
      errores: errores.length,
      resultados,
      erroresDetalle: errores,
    };
  }
}
