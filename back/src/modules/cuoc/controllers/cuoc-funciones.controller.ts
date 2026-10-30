import { Controller, Get, Post, Patch, Delete, Param, Body, Query, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CuocHijosService } from '../services/cuoc-hijos.service';
import { CreateCuocFuncionDto } from '../dto/create-cuoc-hijos.dto';
import { UpdateCuocFuncionDto } from '../dto/update-cuoc-hijos.dto';
import { ConsultarCuocFuncionesDto } from '../dto/consultar-cuoc-funciones.dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';

@ApiTags('CUOC - Funciones')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo()
@Controller('api/cuoc/funciones')
export class CuocFuncionesController {
  constructor(private readonly hijosService: CuocHijosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las funciones CUOC (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de funciones CUOC' })
  findAll(@Query() pagination: PaginationDto) {
    return this.hijosService.findAllFunciones(pagination);
  }

  @Get('consulta')
  @ApiOperation({ summary: 'Consultar funciones CUOC (paginado, búsqueda por texto y filtros de la ocupación dueña)' })
  @ApiResponse({ status: 200, description: 'Página de funciones con datos de la ocupación' })
  consultar(@Query() dto: ConsultarCuocFuncionesDto) {
    return this.hijosService.consultarFunciones(dto);
  }

  @Get('ocupacion/:cod')
  @ApiOperation({ summary: 'Listar funciones de una ocupación CUOC' })
  @ApiParam({ name: 'cod', example: '3512', description: 'Código de la ocupación CUOC' })
  @ApiResponse({ status: 200, description: 'Funciones de la ocupación' })
  findByOcupacion(@Param('cod') cod: string) {
    return this.hijosService.findFuncionesByOcupacion(cod);
  }

  @Get('opciones')
  @ApiOperation({ summary: 'Obtener opciones de funciones CUOC para filtros' })
  @ApiResponse({ status: 200, description: 'Lista de funciones (código y nombre)' })
  obtenerOpciones() {
    return this.hijosService.obtenerOpcionesFunciones();
  }

  @Get(':codigo')
  @ApiOperation({ summary: 'Obtener una función CUOC por ID' })
  @ApiParam({ name: 'codigo', example: 1, description: 'ID numérico de la función' })
  @ApiResponse({ status: 200, description: 'Función encontrada' })
  @ApiResponse({ status: 404, description: 'Función no encontrada' })
  findOne(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.hijosService.findOneFuncion(codigo);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva función CUOC' })
  @ApiBody({ type: CreateCuocFuncionDto })
  @ApiResponse({ status: 201, description: 'Función creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  create(@Body() dto: CreateCuocFuncionDto) {
    return this.hijosService.createFuncion(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':codigo')
  @ApiOperation({ summary: 'Actualizar una función CUOC' })
  @ApiParam({ name: 'codigo', example: 1, description: 'ID numérico de la función' })
  @ApiBody({ type: UpdateCuocFuncionDto })
  @ApiResponse({ status: 200, description: 'Función actualizada' })
  @ApiResponse({ status: 404, description: 'Función no encontrada' })
  update(@Param('codigo', ParseIntPipe) codigo: number, @Body() dto: UpdateCuocFuncionDto) {
    return this.hijosService.updateFuncion(codigo, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete(':codigo')
  @ApiOperation({ summary: 'Eliminar una función CUOC' })
  @ApiParam({ name: 'codigo', example: 1, description: 'ID numérico de la función a eliminar' })
  @ApiResponse({ status: 200, description: 'Función eliminada' })
  @ApiResponse({ status: 404, description: 'Función no encontrada' })
  remove(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.hijosService.removeFuncion(codigo);
  }
}
