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
import { CnoOcupacionService } from '../services/cno-ocupacion.service';
import { CreateCnoOcupacionDto } from '../dto/create-cno-ocupacion.dto';
import { UpdateCnoOcupacionDto } from '../dto/update-cno-ocupacion.dto';
import { ConsultarOcupacionesDto } from '../dto/consultar-ocupaciones.dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { BuscarOcupacionDto } from '../../../common/dto/buscar-ocupacion.dto';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';

@ApiTags('CNO - Ocupaciones')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo()
@Controller('api/cno/ocupaciones')
export class CnoOcupacionController {
  constructor(private readonly ocupacionService: CnoOcupacionService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las ocupaciones CNO (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de ocupaciones CNO' })
  findAll(@Query() pagination: PaginationDto) {
    return this.ocupacionService.findAll(pagination);
  }

  // OJO: esta ruta debe declararse ANTES de @Get(':cod'), o Nest resolvería
  // /buscar como si "buscar" fuera un código de ocupación.
  @Get('buscar')
  @ApiOperation({ summary: 'Autocompletado de ocupaciones CNO por código o nombre' })
  @ApiResponse({ status: 200, description: 'Lista corta de sugerencias (código y nombre)' })
  buscar(@Query() filtros: BuscarOcupacionDto) {
    return this.ocupacionService.buscar(filtros);
  }

  // Igual que /buscar: va ANTES de @Get(':cod').
  @Get('consulta')
  @ApiOperation({
    summary: 'Tabla de resultados: texto + filtros (nivel/área/estado) + orden + paginación',
  })
  @ApiResponse({
    status: 200,
    description: 'Página de resultados con los contadores de cada bloque de la ocupación',
  })
  consultar(@Query() filtros: ConsultarOcupacionesDto) {
    return this.ocupacionService.consultar(filtros);
  }

  @Get(':cod')
  @ApiOperation({ summary: 'Obtener una ocupación CNO por código' })
  @ApiParam({ name: 'cod', example: '2111', description: 'Código de la ocupación CNO' })
  @ApiResponse({ status: 200, description: 'Ocupación CNO encontrada' })
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
  @ApiOperation({ summary: 'Crear una nueva ocupación CNO' })
  @ApiBody({ type: CreateCnoOcupacionDto })
  @ApiResponse({ status: 201, description: 'Ocupación CNO creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  create(@Body() dto: CreateCnoOcupacionDto) {
    return this.ocupacionService.create(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':cod')
  @ApiOperation({ summary: 'Actualizar los campos propios de una ocupación CNO' })
  @ApiParam({ name: 'cod', example: '2111', description: 'Código de la ocupación CNO' })
  @ApiBody({ type: UpdateCnoOcupacionDto })
  @ApiResponse({ status: 200, description: 'Ocupación CNO actualizada' })
  @ApiResponse({ status: 404, description: 'Ocupación no encontrada' })
  update(@Param('cod') cod: string, @Body() dto: UpdateCnoOcupacionDto) {
    return this.ocupacionService.update(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete(':cod')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar una ocupación CNO por código' })
  @ApiParam({ name: 'cod', example: '2111', description: 'Código de la ocupación CNO a eliminar' })
  @ApiResponse({ status: 200, description: 'Ocupación CNO eliminada' })
  @ApiResponse({ status: 404, description: 'Ocupación no encontrada' })
  remove(@Param('cod') cod: string) {
    return this.ocupacionService.remove(cod);
  }
}
