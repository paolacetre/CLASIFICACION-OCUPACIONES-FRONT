import { Body, Controller, Delete, Get, Param, Patch, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ActualizarItemCatalogoDto, CrearItemCatalogoDto } from '../../../common/dto/item-catalogo.dto';
import { CuocHijosService } from '../services/cuoc-hijos.service';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';

@ApiTags('CUOC - Áreas de Cualificación')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo({ ttl: 3600 })
@Controller('api/cuoc/areas-cualificacion')
export class CuocAreasCualificacionController {
  constructor(private readonly hijosService: CuocHijosService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar todas las áreas de cualificación CUOC (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de áreas de cualificación' })
  findAll(@Query() pagination: PaginationDto) {
    return this.hijosService.findAllAreasCualificacion(pagination);
  }

  @Get(':codigo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener un área de cualificación CUOC por código' })
  @ApiParam({ name: 'codigo', example: 'TIC', description: 'Código del área de cualificación' })
  @ApiResponse({ status: 200, description: 'Área de cualificación encontrada' })
  @ApiResponse({ status: 404, description: 'Área de cualificación no encontrada' })
  findOne(@Param('codigo') codigo: string) {
    return this.hijosService.findOneAreaCualificacion(codigo);
  }
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Actualización: crea un área de cualificación en el catálogo oficial.' })
  @ApiResponse({ status: 409, description: 'Código o nombre ya existentes' })
  crearArea(@Body() dto: CrearItemCatalogoDto) {
    return this.hijosService.crearArea(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':codigo')
  @ApiOperation({ summary: 'Edita un área de cualificación del catálogo. El código no cambia.' })
  @ApiParam({ name: 'codigo', example: 'AFDE' })
  actualizarArea(@Param('codigo') cod: string, @Body() dto: ActualizarItemCatalogoDto) {
    return this.hijosService.actualizarArea(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete(':codigo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina un área de cualificación del catálogo si ninguna ocupación lo usa.' })
  @ApiParam({ name: 'codigo', example: 'AFDE' })
  @ApiResponse({ status: 409, description: 'Está en uso' })
  eliminarArea(@Param('codigo') cod: string) {
    return this.hijosService.eliminarArea(cod);
  }

}
