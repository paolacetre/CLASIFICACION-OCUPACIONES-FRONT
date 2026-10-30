import { Body, Controller, Delete, Get, Param, Patch, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ActualizarNivelCopiaDto, ConsultarNivelesDto, CrearNivelCopiaDto, CrearNivelDto } from '../../../common/dto/nivel-copia.dto';
import { ActualizarItemCatalogoDto, CrearItemCatalogoDto } from '../../../common/dto/item-catalogo.dto';
import { CnoCatalogosService } from '../services/cno-catalogos.service';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';

@ApiTags('CNO - Catálogos')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo({ ttl: 3600 })
@Controller('api/cno/catalogos')
export class CnoCatalogosController {
  constructor(private readonly catalogosService: CnoCatalogosService) {}

  @Get('funciones')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar el catálogo de funciones CNO (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de funciones CNO' })
  findAllFunciones(@Query() pagination: PaginationDto) {
    return this.catalogosService.findAllFunciones(pagination);
  }

  @Get('areas-desempeno')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar el catálogo de áreas de desempeño CNO (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de áreas de desempeño CNO' })
  findAllAreasDesempeno(@Query() pagination: PaginationDto) {
    return this.catalogosService.findAllAreasDesempeno(pagination);
  }
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('areas-desempeno')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Actualización: crea un área de desempeño en el catálogo oficial.' })
  @ApiResponse({ status: 409, description: 'Código o nombre ya existentes' })
  crearArea(@Body() dto: CrearItemCatalogoDto) {
    return this.catalogosService.crearArea(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch('areas-desempeno/:cod')
  @ApiOperation({ summary: 'Edita el nombre y la descripción de un área de desempeño. El código no cambia.' })
  @ApiParam({ name: 'cod', example: '9' })
  actualizarArea(@Param('cod') cod: string, @Body() dto: ActualizarItemCatalogoDto) {
    return this.catalogosService.actualizarArea(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete('areas-desempeno/:cod')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina un área de desempeño que no use ninguna ocupación.' })
  @ApiParam({ name: 'cod', example: '9' })
  @ApiResponse({ status: 409, description: 'Está en uso' })
  eliminarArea(@Param('cod') cod: string) {
    return this.catalogosService.eliminarArea(cod);
  }


  @Get('niveles-cualificacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar niveles de cualificación CNO (paginado). Con incluirCopias=true suma las copias de Análisis.' })
  @ApiResponse({ status: 200, description: 'Página de niveles de cualificación CNO' })
  findAllNivelesCualificacion(@Query() consulta: ConsultarNivelesDto) {
    return this.catalogosService.findAllNivelesCualificacion(consulta);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('niveles-cualificacion')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Actualización: crea un nivel en el catálogo oficial.' })
  @ApiResponse({ status: 409, description: 'Código o nombre ya existentes' })
  crearNivel(@Body() dto: CrearNivelDto) {
    return this.catalogosService.crearNivel(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('niveles-cualificacion/copias')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Análisis: crea una copia de nivel (C1, C2…) que solo se usa en Análisis.' })
  @ApiResponse({ status: 409, description: 'Ya existe un nivel con ese nombre' })
  crearCopiaNivel(@Body() dto: CrearNivelCopiaDto) {
    return this.catalogosService.crearCopiaNivel(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch('niveles-cualificacion/:cod')
  @ApiOperation({ summary: 'Edita el nombre y la descripción de un nivel. El código no cambia.' })
  @ApiParam({ name: 'cod', example: '2' })
  actualizarNivel(@Param('cod') cod: string, @Body() dto: ActualizarNivelCopiaDto) {
    return this.catalogosService.actualizarNivel(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete('niveles-cualificacion/:cod')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina un nivel que no use ninguna ocupación.' })
  @ApiParam({ name: 'cod', example: '7' })
  @ApiResponse({ status: 409, description: 'El nivel lo usan ocupaciones' })
  eliminarNivel(@Param('cod') cod: string) {
    return this.catalogosService.eliminarNivel(cod);
  }

  @Get('conocimientos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar el catálogo de conocimientos CNO (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de conocimientos CNO' })
  findAllConocimientos(@Query() pagination: PaginationDto) {
    return this.catalogosService.findAllConocimientos(pagination);
  }
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('conocimientos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Actualización: crea un conocimiento en el catálogo oficial (código automático).' })
  @ApiResponse({ status: 409, description: 'Código o nombre ya existentes' })
  crearConocimiento(@Body() dto: CrearItemCatalogoDto) {
    return this.catalogosService.crearConocimiento(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch('conocimientos/:cod')
  @ApiOperation({ summary: 'Edita el nombre y la descripción de un conocimiento. El código no cambia.' })
  @ApiParam({ name: 'cod', example: '12' })
  actualizarConocimiento(@Param('cod') cod: string, @Body() dto: ActualizarItemCatalogoDto) {
    return this.catalogosService.actualizarConocimiento(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete('conocimientos/:cod')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina un conocimiento que no use ninguna ocupación.' })
  @ApiParam({ name: 'cod', example: '12' })
  @ApiResponse({ status: 409, description: 'Está en uso' })
  eliminarConocimiento(@Param('cod') cod: string) {
    return this.catalogosService.eliminarConocimiento(cod);
  }


  @Get('habilidades')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar el catálogo de habilidades/destrezas (compartido con CUOC, paginado)' })
  @ApiResponse({ status: 200, description: 'Página de habilidades/destrezas' })
  findAllHabilidades(@Query() pagination: PaginationDto) {
    return this.catalogosService.findAllHabilidades(pagination);
  }
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('habilidades')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Actualización: crea una habilidad en el catálogo oficial (código automático).' })
  @ApiResponse({ status: 409, description: 'Código o nombre ya existentes' })
  crearHabilidad(@Body() dto: CrearItemCatalogoDto) {
    return this.catalogosService.crearHabilidad(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch('habilidades/:cod')
  @ApiOperation({ summary: 'Edita el nombre y la descripción de una habilidad (compartida con las destrezas CUOC). El código no cambia.' })
  @ApiParam({ name: 'cod', example: '5' })
  actualizarHabilidad(@Param('cod') cod: string, @Body() dto: ActualizarItemCatalogoDto) {
    return this.catalogosService.actualizarHabilidad(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete('habilidades/:cod')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina una habilidad (compartida con las destrezas CUOC) que no use ninguna ocupación.' })
  @ApiParam({ name: 'cod', example: '5' })
  @ApiResponse({ status: 409, description: 'Está en uso' })
  eliminarHabilidad(@Param('cod') cod: string) {
    return this.catalogosService.eliminarHabilidad(cod);
  }


  @Get('denominaciones')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar el catálogo de denominaciones CNO (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de denominaciones CNO' })
  findAllDenominaciones(@Query() pagination: PaginationDto) {
    return this.catalogosService.findAllDenominaciones(pagination);
  }
}
