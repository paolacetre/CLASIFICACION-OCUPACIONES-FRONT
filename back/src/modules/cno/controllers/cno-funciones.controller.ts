import { Controller, Get, Post, Patch, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CnoFuncionesService } from '../services/cno-funciones.service';
import { CreateCnoFuncionDto } from '../dto/create-cno-funcion.dto';
import { UpdateCnoFuncionDto } from '../dto/update-cno-funcion.dto';
import { ConsultarCnoFuncionesDto } from '../dto/consultar-cno-funciones.dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';

@ApiTags('CNO - Funciones')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo()
@Controller('api/cno/funciones')
export class CnoFuncionesController {
  constructor(private readonly funcionesService: CnoFuncionesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar el catálogo de funciones CNO (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de funciones CNO' })
  findAll(@Query() pagination: PaginationDto) {
    return this.funcionesService.findAll(pagination);
  }

  @Get('consulta')
  @ApiOperation({ summary: 'Consultar funciones CNO (paginado, búsqueda por texto y filtros de la ocupación dueña)' })
  @ApiResponse({ status: 200, description: 'Página de funciones con datos de la ocupación' })
  consultar(@Query() dto: ConsultarCnoFuncionesDto) {
    return this.funcionesService.consultar(dto);
  }

  @Get('opciones')
  @ApiOperation({ summary: 'Obtener opciones de funciones CNO para filtros' })
  @ApiResponse({ status: 200, description: 'Lista de funciones (código y nombre)' })
  obtenerOpciones() {
    return this.funcionesService.obtenerOpciones();
  }

  @Get(':codFuncion')
  @ApiOperation({ summary: 'Obtener una función CNO del catálogo por código' })
  @ApiParam({ name: 'codFuncion', example: 'F-001', description: 'Código de la función' })
  @ApiResponse({ status: 200, description: 'Función encontrada' })
  @ApiResponse({ status: 404, description: 'Función no encontrada' })
  findOne(@Param('codFuncion') codFuncion: string) {
    return this.funcionesService.findOne(codFuncion);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva función en el catálogo CNO (código F-NNN autogenerado)' })
  @ApiBody({ type: CreateCnoFuncionDto })
  @ApiResponse({ status: 201, description: 'Función creada exitosamente' })
  @ApiResponse({ status: 409, description: 'Ya existe una función con esa descripción' })
  create(@Body() dto: CreateCnoFuncionDto) {
    return this.funcionesService.crear(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':codFuncion')
  @ApiOperation({ summary: 'Actualizar la descripción de una función del catálogo CNO' })
  @ApiParam({ name: 'codFuncion', example: 'F-001', description: 'Código de la función' })
  @ApiBody({ type: UpdateCnoFuncionDto })
  @ApiResponse({ status: 200, description: 'Función actualizada' })
  @ApiResponse({ status: 404, description: 'Función no encontrada' })
  update(@Param('codFuncion') codFuncion: string, @Body() dto: UpdateCnoFuncionDto) {
    return this.funcionesService.actualizar(codFuncion, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch('relaciones/:codigo/inactivar')
  @ApiOperation({ summary: 'Inactivar el vínculo entre una ocupación y una función (cno_reg_funciones)' })
  @ApiParam({ name: 'codigo', example: 'F-2111.001', description: 'Código de la relación ocupación-función' })
  @ApiResponse({ status: 200, description: 'Relación inactivada' })
  @ApiResponse({ status: 404, description: 'Relación no encontrada' })
  inactivarRelacion(@Param('codigo') codigo: string) {
    return this.funcionesService.inactivarRelacion(codigo);
  }
}
