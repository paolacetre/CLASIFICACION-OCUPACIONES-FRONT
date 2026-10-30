import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CnoDenominacionesService } from '../services/cno-denominaciones.service';
import { CreateCnoDenominacionDto } from '../dto/create-cno-denominacion.dto';
import { UpdateCnoDenominacionDto } from '../dto/update-cno-denominacion.dto';
import { ConsultarCnoDenominacionesDto } from '../dto/consultar-cno-denominaciones.dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';

@ApiTags('CNO - Denominaciones')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo()
@Controller('api/cno/denominaciones')
export class CnoDenominacionesController {
  constructor(private readonly denominacionesService: CnoDenominacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las denominaciones CNO (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de denominaciones CNO' })
  findAll(@Query() pagination: PaginationDto) {
    return this.denominacionesService.findAll(pagination);
  }

  @Get('consulta')
  @ApiOperation({ summary: 'Consultar denominaciones CNO (paginado, búsqueda por texto y filtros de la ocupación dueña)' })
  @ApiResponse({ status: 200, description: 'Página de denominaciones con datos de la ocupación' })
  consultar(@Query() dto: ConsultarCnoDenominacionesDto) {
    return this.denominacionesService.consultar(dto);
  }

  @Get('ocupacion/:cod')
  @ApiOperation({ summary: 'Listar denominaciones de una ocupación CNO' })
  @ApiParam({ name: 'cod', example: '2111', description: 'Código de la ocupación CNO' })
  @ApiResponse({ status: 200, description: 'Denominaciones de la ocupación' })
  findByOcupacion(@Param('cod') cod: string) {
    return this.denominacionesService.findByOcupacion(cod);
  }

  @Get(':codigo')
  @ApiOperation({ summary: 'Obtener una denominación CNO por su ID numérico' })
  @ApiParam({ name: 'codigo', example: 1, description: 'ID numérico de la denominación' })
  @ApiResponse({ status: 200, description: 'Denominación encontrada' })
  @ApiResponse({ status: 404, description: 'Denominación no encontrada' })
  findOne(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.denominacionesService.findOne(codigo);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva denominación para una ocupación CNO (código D-{codOcupacion}.NNN autogenerado)' })
  @ApiBody({ type: CreateCnoDenominacionDto })
  @ApiResponse({ status: 201, description: 'Denominación creada exitosamente' })
  @ApiResponse({ status: 409, description: 'Ya existe una denominación activa equivalente para esa ocupación' })
  create(@Body() dto: CreateCnoDenominacionDto) {
    return this.denominacionesService.crear(dto.codOcupacionCno, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':codigo')
  @ApiOperation({ summary: 'Actualizar una denominación CNO' })
  @ApiParam({ name: 'codigo', example: 1, description: 'ID numérico de la denominación' })
  @ApiBody({ type: UpdateCnoDenominacionDto })
  @ApiResponse({ status: 200, description: 'Denominación actualizada' })
  @ApiResponse({ status: 404, description: 'Denominación no encontrada' })
  update(@Param('codigo', ParseIntPipe) codigo: number, @Body() dto: UpdateCnoDenominacionDto) {
    return this.denominacionesService.actualizar(codigo, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':codigo/inactivar')
  @ApiOperation({ summary: 'Inactivar una denominación CNO' })
  @ApiParam({ name: 'codigo', example: 1, description: 'ID numérico de la denominación' })
  @ApiResponse({ status: 200, description: 'Denominación inactivada' })
  @ApiResponse({ status: 404, description: 'Denominación no encontrada' })
  inactivar(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.denominacionesService.inactivar(codigo);
  }
}
