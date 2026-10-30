import { Controller, Get, Post, Patch, Delete, Param, Body, Query, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ActualizarItemCatalogoDto, CrearItemCatalogoDto } from '../../../common/dto/item-catalogo.dto';
import { CuocHijosService } from '../services/cuoc-hijos.service';
import { CreateCuocDestrezaDto, RegistrarDestrezaOcupacionDto } from '../dto/create-cuoc-hijos.dto';
import { UpdateCuocDestrezaDto } from '../dto/update-cuoc-hijos.dto';
import { Auth } from '../../auth/decorators/auth.decorator';
import { Role } from '../../../common/enums/role.enum';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CacheCatalogo } from '../../cache/cache-catalogo.decorator';

@ApiTags('CUOC - Destrezas')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO, Role.TENDENCIAS_OCUPACIONES)
@CacheCatalogo()
@Controller('api/cuoc/destrezas')
export class CuocDestrezasController {
  constructor(private readonly hijosService: CuocHijosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las destrezas CUOC (paginado)' })
  @ApiResponse({ status: 200, description: 'Página de destrezas CUOC' })
  findAll(@Query() pagination: PaginationDto) { return this.hijosService.findAllDestrezas(pagination); }

  @Get('catalogo')
  @ApiOperation({ summary: 'Listar el catálogo maestro de destrezas CUOC' })
  @ApiResponse({ status: 200, description: 'Catálogo de destrezas CUOC' })
  findAllCatalogo() {
    return this.hijosService.findAllDestrezasCatalogo();
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Get('catalogo/siguiente-id')
  @ApiOperation({ summary: 'ID que tendrá la próxima destreza del catálogo (último + 1)' })
  @ApiResponse({ status: 200, description: '{ siguienteId: number }' })
  siguienteIdCatalogo() {
    return this.hijosService.siguienteIdDestreza();
  }
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('catalogo')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Actualización: crea una destreza en el catálogo oficial (código automático).' })
  @ApiResponse({ status: 409, description: 'Código o nombre ya existentes' })
  crearDestrezaCatalogo(@Body() dto: CrearItemCatalogoDto) {
    return this.hijosService.crearDestrezaCatalogo(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch('catalogo/:cod')
  @ApiOperation({ summary: 'Edita una destreza (compartida con las habilidades CNO) del catálogo. El código no cambia.' })
  @ApiParam({ name: 'cod', example: '5' })
  actualizarDestrezaCatalogo(@Param('cod') cod: string, @Body() dto: ActualizarItemCatalogoDto) {
    return this.hijosService.actualizarDestrezaCatalogo(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete('catalogo/:cod')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina una destreza (compartida con las habilidades CNO) del catálogo si ninguna ocupación lo usa.' })
  @ApiParam({ name: 'cod', example: '5' })
  @ApiResponse({ status: 409, description: 'Está en uso' })
  eliminarDestrezaCatalogo(@Param('cod') cod: string) {
    return this.hijosService.eliminarDestrezaCatalogo(cod);
  }


  @Get('ocupacion/:cod')
  @ApiOperation({ summary: 'Listar destrezas de una ocupación CUOC' })
  @ApiParam({ name: 'cod', example: '3512', description: 'Código de la ocupación CUOC' })
  @ApiResponse({ status: 200, description: 'Destrezas de la ocupación' })
  findByOcupacion(@Param('cod') cod: string) {
    return this.hijosService.findDestrezasByOcupacion(cod);
  }

  @Get(':cod')
  @ApiOperation({ summary: 'Obtener una destreza CUOC por ID' })
  @ApiParam({ name: 'cod', example: 1, description: 'ID numérico de la destreza' })
  @ApiResponse({ status: 200, description: 'Destreza encontrada' })
  @ApiResponse({ status: 404, description: 'Destreza no encontrada' })
  findOne(@Param('cod', ParseIntPipe) cod: number) {
    return this.hijosService.findOneDestreza(cod);
  }

  /**
   * «Agregar destreza» de Actualización: estructura de la hoja «Destrezas» de
   * la plantilla CUOC (ocupación + ID + nombre). Crea la destreza en el
   * catálogo si el ID es nuevo y la vincula a la ocupación.
   */
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('registro')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar una destreza para una ocupación CUOC (estructura de la plantilla)' })
  @ApiBody({ type: RegistrarDestrezaOcupacionDto })
  @ApiResponse({ status: 201, description: 'Destreza vinculada a la ocupación' })
  @ApiResponse({ status: 404, description: 'La ocupación no existe' })
  @ApiResponse({ status: 409, description: 'La ocupación ya tiene esa destreza, o el ID/nombre no coinciden con el catálogo' })
  registrar(@Body() dto: RegistrarDestrezaOcupacionDto) {
    return this.hijosService.registrarDestrezaOcupacion(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una nueva destreza CUOC' })
  @ApiBody({ type: CreateCuocDestrezaDto })
  @ApiResponse({ status: 201, description: 'Destreza creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  create(@Body() dto: CreateCuocDestrezaDto) {
    return this.hijosService.createDestreza(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':cod')
  @ApiOperation({ summary: 'Actualizar una destreza CUOC' })
  @ApiParam({ name: 'cod', example: 1, description: 'ID numérico de la destreza' })
  @ApiBody({ type: UpdateCuocDestrezaDto })
  @ApiResponse({ status: 200, description: 'Destreza actualizada' })
  @ApiResponse({ status: 404, description: 'Destreza no encontrada' })
  update(@Param('cod', ParseIntPipe) cod: number, @Body() dto: UpdateCuocDestrezaDto) {
    return this.hijosService.updateDestreza(cod, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete(':cod')
  @ApiOperation({ summary: 'Eliminar una destreza CUOC' })
  @ApiParam({ name: 'cod', example: 1, description: 'ID numérico de la destreza a eliminar' })
  @ApiResponse({ status: 200, description: 'Destreza eliminada' })
  @ApiResponse({ status: 404, description: 'Destreza no encontrada' })
  remove(@Param('cod', ParseIntPipe) cod: number) {
    return this.hijosService.removeDestreza(cod);
  }
}
