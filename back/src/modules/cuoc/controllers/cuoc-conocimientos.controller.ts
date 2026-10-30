import { Controller, Get, Post, Patch, Delete, Param, Body, Query, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ActualizarItemCatalogoDto, CrearItemCatalogoDto } from '../../../common/dto/item-catalogo.dto';
import { CuocHijosService } from '../services/cuoc-hijos.service';
import { CreateCuocRegConocimientoDto } from '../dto/create-cuoc-hijos.dto';
import { UpdateCuocRegConocimientoDto } from '../dto/update-cuoc-hijos.dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';

@ApiTags('CUOC - Conocimientos')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo()
@Controller('api/cuoc/conocimientos')
export class CuocConocimientosController {
  constructor(private readonly hijosService: CuocHijosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los conocimientos CUOC (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de conocimientos CUOC' })
  findAll(@Query() pagination: PaginationDto) { return this.hijosService.findAllRegConocimientos(pagination); }

  @Get('catalogo')
  @ApiOperation({ summary: 'Listar el catálogo maestro de conocimientos CUOC' })
  @ApiResponse({ status: 200, description: 'Catálogo de conocimientos CUOC' })
  findAllCatalogo() {
    return this.hijosService.findAllConocimientoCatalogo();
  }
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('catalogo')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Actualización: crea un conocimiento en el catálogo oficial (código automático).' })
  @ApiResponse({ status: 409, description: 'Código o nombre ya existentes' })
  crearConocimientoCatalogo(@Body() dto: CrearItemCatalogoDto) {
    return this.hijosService.crearConocimientoCatalogo(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch('catalogo/:cod')
  @ApiOperation({ summary: 'Edita un conocimiento del catálogo. El código no cambia.' })
  @ApiParam({ name: 'cod', example: '12' })
  actualizarConocimientoCatalogo(@Param('cod') cod: string, @Body() dto: ActualizarItemCatalogoDto) {
    return this.hijosService.actualizarConocimientoCatalogo(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete('catalogo/:cod')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina un conocimiento del catálogo si ninguna ocupación lo usa.' })
  @ApiParam({ name: 'cod', example: '12' })
  @ApiResponse({ status: 409, description: 'Está en uso' })
  eliminarConocimientoCatalogo(@Param('cod') cod: string) {
    return this.hijosService.eliminarConocimientoCatalogo(cod);
  }


  @Get('ocupacion/:cod')
  @ApiOperation({ summary: 'Listar conocimientos de una ocupación CUOC' })
  @ApiParam({ name: 'cod', example: '3512', description: 'Código de la ocupación CUOC' })
  @ApiResponse({ status: 200, description: 'Conocimientos de la ocupación' })
  findByOcupacion(@Param('cod') cod: string) {
    return this.hijosService.findRegConocimientosByOcupacion(cod);
  }

  @Get(':codigo')
  @ApiOperation({ summary: 'Obtener un conocimiento CUOC por ID' })
  @ApiParam({ name: 'codigo', example: 1, description: 'ID numérico del registro de conocimiento' })
  @ApiResponse({ status: 200, description: 'Conocimiento encontrado' })
  @ApiResponse({ status: 404, description: 'Conocimiento no encontrado' })
  findOne(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.hijosService.findOneRegConocimiento(codigo);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Asociar un conocimiento a una ocupación CUOC' })
  @ApiBody({ type: CreateCuocRegConocimientoDto })
  @ApiResponse({ status: 201, description: 'Conocimiento asociado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  create(@Body() dto: CreateCuocRegConocimientoDto) {
    return this.hijosService.createRegConocimiento(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':codigo')
  @ApiOperation({ summary: 'Actualizar un conocimiento CUOC' })
  @ApiParam({ name: 'codigo', example: 1, description: 'ID numérico del registro de conocimiento' })
  @ApiBody({ type: UpdateCuocRegConocimientoDto })
  @ApiResponse({ status: 200, description: 'Conocimiento actualizado' })
  @ApiResponse({ status: 404, description: 'Conocimiento no encontrado' })
  update(@Param('codigo', ParseIntPipe) codigo: number, @Body() dto: UpdateCuocRegConocimientoDto) {
    return this.hijosService.updateRegConocimiento(codigo, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete(':codigo')
  @ApiOperation({ summary: 'Eliminar un conocimiento CUOC' })
  @ApiParam({ name: 'codigo', example: 1, description: 'ID numérico del registro a eliminar' })
  @ApiResponse({ status: 200, description: 'Conocimiento eliminado' })
  @ApiResponse({ status: 404, description: 'Conocimiento no encontrado' })
  remove(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.hijosService.removeRegConocimiento(codigo);
  }
}
