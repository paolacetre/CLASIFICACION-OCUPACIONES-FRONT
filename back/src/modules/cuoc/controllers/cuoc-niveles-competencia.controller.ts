import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { CuocHijosService } from '../services/cuoc-hijos.service';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { ActualizarNivelCopiaDto, CrearNivelCopiaDto, CrearNivelDto, IncluirCopiasDto } from '../../../common/dto/nivel-copia.dto';

@ApiTags('CUOC - Niveles de Competencia')
// Sin @Auth de clase el GET respondía a cualquiera, sin sesión ni API key.
// Mismos roles de lectura que el resto de controladores CUOC.
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo({ ttl: 3600 })
@Controller('api/cuoc/niveles-competencia')
export class CuocNivelesCompetenciaController {
  constructor(private readonly hijosService: CuocHijosService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar niveles de competencia CUOC. Con incluirCopias=true suma las copias de Análisis.' })
  @ApiResponse({ status: 200, description: 'Lista de niveles de competencia' })
  findAll(@Query() consulta: IncluirCopiasDto) {
    return this.hijosService.findAllNivelesCompetencia(consulta.incluirCopias === true);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Actualización: crea un nivel en el catálogo oficial (código 1 a 1000).' })
  @ApiResponse({ status: 409, description: 'Código o nombre ya existentes' })
  crear(@Body() dto: CrearNivelDto) {
    return this.hijosService.crearNivel(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('copias')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Análisis: crea una copia de nivel (1001, 1002…) que solo se usa en Análisis.' })
  @ApiResponse({ status: 409, description: 'Ya existe un nivel con ese nombre' })
  crearCopia(@Body() dto: CrearNivelCopiaDto) {
    return this.hijosService.crearCopiaNivel(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':cod')
  @ApiOperation({ summary: 'Edita el nombre y la descripción de un nivel. El código no cambia.' })
  @ApiParam({ name: 'cod', example: 2 })
  actualizar(@Param('cod', ParseIntPipe) cod: number, @Body() dto: ActualizarNivelCopiaDto) {
    return this.hijosService.actualizarNivel(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete(':cod')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina un nivel que no use ninguna ocupación.' })
  @ApiParam({ name: 'cod', example: 5 })
  @ApiResponse({ status: 409, description: 'El nivel lo usan ocupaciones' })
  eliminar(@Param('cod', ParseIntPipe) cod: number) {
    return this.hijosService.eliminarNivel(cod);
  }
}
