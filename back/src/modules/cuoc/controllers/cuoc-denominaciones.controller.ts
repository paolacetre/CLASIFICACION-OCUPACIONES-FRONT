import { Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CuocHijosService } from '../services/cuoc-hijos.service';
import { CreateCuocDenominacionDto } from '../dto/create-cuoc-hijos.dto';
import { UpdateCuocDenominacionDto } from '../dto/update-cuoc-hijos.dto';
import { ConsultarCuocDenominacionesDto } from '../dto/consultar-cuoc-denominaciones.dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';

@ApiTags('CUOC - Denominaciones')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo()
@Controller('api/cuoc/denominaciones')
export class CuocDenominacionesController {
  constructor(private readonly hijosService: CuocHijosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las denominaciones CUOC (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de denominaciones CUOC' })
  findAll(@Query() pagination: PaginationDto) {
    return this.hijosService.findAllDenominaciones(pagination);
  }

  @Get('consulta')
  @ApiOperation({ summary: 'Consultar denominaciones CUOC (paginado, búsqueda por texto y filtros de la ocupación dueña)' })
  @ApiResponse({ status: 200, description: 'Página de denominaciones con datos de la ocupación' })
  consultar(@Query() dto: ConsultarCuocDenominacionesDto) {
    return this.hijosService.consultarDenominaciones(dto);
  }

  @Get('ocupacion/:cod')
  @ApiOperation({ summary: 'Listar denominaciones de una ocupación CUOC' })
  @ApiParam({ name: 'cod', example: '3512', description: 'Código de la ocupación CUOC' })
  @ApiResponse({ status: 200, description: 'Denominaciones de la ocupación' })
  findByOcupacion(@Param('cod') cod: string) {
    return this.hijosService.findDenominacionesByOcupacion(cod);
  }

  @Get(':cod')
  @ApiOperation({ summary: 'Obtener una denominación CUOC por código' })
  @ApiParam({ name: 'cod', example: 'DEN-001', description: 'Código de la denominación' })
  @ApiResponse({ status: 200, description: 'Denominación encontrada' })
  @ApiResponse({ status: 404, description: 'Denominación no encontrada' })
  findOne(@Param('cod') cod: string) {
    return this.hijosService.findOneDenominacion(cod);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva denominación CUOC' })
  @ApiBody({ type: CreateCuocDenominacionDto })
  @ApiResponse({ status: 201, description: 'Denominación creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  create(@Body() dto: CreateCuocDenominacionDto) {
    return this.hijosService.createDenominacion(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':cod')
  @ApiOperation({ summary: 'Actualizar una denominación CUOC' })
  @ApiParam({ name: 'cod', example: 'DEN-001', description: 'Código de la denominación' })
  @ApiBody({ type: UpdateCuocDenominacionDto })
  @ApiResponse({ status: 200, description: 'Denominación actualizada' })
  @ApiResponse({ status: 404, description: 'Denominación no encontrada' })
  update(@Param('cod') cod: string, @Body() dto: UpdateCuocDenominacionDto) {
    return this.hijosService.updateDenominacion(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete(':cod')
  @ApiOperation({ summary: 'Eliminar una denominación CUOC' })
  @ApiParam({ name: 'cod', example: 'DEN-001', description: 'Código de la denominación a eliminar' })
  @ApiResponse({ status: 200, description: 'Denominación eliminada' })
  @ApiResponse({ status: 404, description: 'Denominación no encontrada' })
  remove(@Param('cod') cod: string) {
    return this.hijosService.removeDenominacion(cod);
  }
}
