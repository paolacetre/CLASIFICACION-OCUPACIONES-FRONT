import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CuocOcupacionService } from '../services';
import { CreateCuocOcupacionDto, UpdateCuocOcupacionDto, ConsultarCuocOcupacionesDto } from '../dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { BuscarOcupacionDto } from '../../../common/dto/buscar-ocupacion.dto';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';

@ApiTags('CUOC - Ocupaciones')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo()
@Controller('api/cuoc/ocupaciones')
export class CuocOcupacionController {
  constructor(private readonly ocupacionService: CuocOcupacionService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las ocupaciones CUOC (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de ocupaciones CUOC' })
  findAll(@Query() pagination: PaginationDto) {
    return this.ocupacionService.findAll(pagination);
  }

  // OJO: debe declararse ANTES de @Get(':cod'), o Nest resolvería /buscar como
  // si "buscar" fuera un código de ocupación.
  @Get('buscar')
  @ApiOperation({ summary: 'Autocompletado de ocupaciones CUOC por código o nombre' })
  @ApiResponse({ status: 200, description: 'Lista corta de sugerencias (código y nombre)' })
  buscar(@Query() filtros: BuscarOcupacionDto) {
    return this.ocupacionService.buscar(filtros);
  }

  // OJO: debe declararse ANTES de @Get(':cod'), igual que /buscar.
  @Get('jerarquia')
  @ApiOperation({ summary: 'Grandes grupos y grupos primarios CUOC, para los filtros de la consulta' })
  @ApiResponse({ status: 200, description: 'Gran grupo y grupos primarios (cada uno con su gran grupo)' })
  jerarquia() {
    return this.ocupacionService.jerarquia();
  }

  // OJO: debe declararse ANTES de @Get(':cod'), igual que /buscar.
  @Get('consulta')
  @ApiOperation({
    summary: 'Tabla de resultados CUOC: texto + filtros (nivel/área/gran grupo/grupo primario/estado) + orden + paginación',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de resultados con los contadores de cada bloque de la ocupación',
  })
  consultar(@Query() filtros: ConsultarCuocOcupacionesDto) {
    return this.ocupacionService.consultar(filtros);
  }

  @Get(':cod')
  @ApiOperation({ summary: 'Obtener una ocupación CUOC por código' })
  @ApiParam({ name: 'cod', example: '3512', description: 'Código de la ocupación CUOC' })
  @ApiResponse({ status: 200, description: 'Ocupación CUOC encontrada' })
  @ApiResponse({ status: 404, description: 'Ocupación no encontrada' })
  findOne(@Param('cod') cod: string) {
    return this.ocupacionService.findOne(cod);
  }

  // Registrar ocupaciones queda en manos de ADMINISTRADOR y ANALISTA. El @Auth de
  // la clase tambien admite APE, que solo consulta; sin este decorador propio ese
  // rol podia crear ocupaciones llamando al endpoint directamente.
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva ocupación CUOC' })
  @ApiBody({ type: CreateCuocOcupacionDto })
  @ApiResponse({ status: 201, description: 'Ocupación CUOC creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  create(@Body() dto: CreateCuocOcupacionDto) {
    return this.ocupacionService.create(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':cod')
  @ApiOperation({ summary: 'Actualizar parcialmente una ocupación CUOC' })
  @ApiParam({ name: 'cod', example: '3512', description: 'Código de la ocupación CUOC' })
  @ApiBody({ type: UpdateCuocOcupacionDto })
  @ApiResponse({ status: 200, description: 'Ocupación CUOC actualizada' })
  @ApiResponse({ status: 404, description: 'Ocupación no encontrada' })
  update(
    @Param('cod') cod: string,
    @Body() dto: UpdateCuocOcupacionDto,
  ) {
    return this.ocupacionService.update(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete(':cod')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar una ocupación CUOC por código' })
  @ApiParam({ name: 'cod', example: '3512', description: 'Código de la ocupación CUOC a eliminar' })
  @ApiResponse({ status: 200, description: 'Ocupación CUOC eliminada' })
  @ApiResponse({ status: 404, description: 'Ocupación no encontrada' })
  remove(@Param('cod') cod: string) {
    return this.ocupacionService.remove(cod);
  }
}
