import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Instrumento2Service } from './instrumento2.service';
import { UpdateInstrumento2Dto } from './dto/update-instrumento2.dto';
import { Instrumento2DetailDto } from './dto/instrumento2-detail.dto';
import { EnviarExpertoInstrumento2Dto } from './dto/enviar-experto-instrumento2.dto';
import {
  AvanceValidacionDto,
  ExpertoResumenDto,
  GuardarValidacionExpertaDto,
  ValidacionExpertaDto,
} from '../validacion-experta/dto/validacion-experta.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Instrumento 2')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO)
@Controller('api/instrumento2')
export class Instrumento2Controller {
  constructor(private readonly instrumento2Service: Instrumento2Service) {}

  @Get()
  // EXPERTO necesita leer la bandeja para su módulo de validación, pero no
  // debe poder editar ni enviar: por eso se amplía solo en los GET.
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO)
  @ApiOperation({ summary: 'Listar bandeja compartida de Instrumento 2 (ANALISTA/ADMINISTRADOR ven todo)' })
  @ApiResponse({ status: 200, description: 'Listado de instrumentos tipo instrumento2', type: [Instrumento2DetailDto] })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<Instrumento2DetailDto[]> {
    return this.instrumento2Service.findAll(user);
  }

  // Antes de `:id`: si no, Nest intenta leer "expertos-disponibles" como id.
  @Get('expertos-disponibles')
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE)
  @ApiOperation({ summary: 'Expertos activos a los que se puede enviar un instrumento' })
  @ApiResponse({ status: 200, type: [ExpertoResumenDto] })
  listarExpertosDisponibles(): Promise<ExpertoResumenDto[]> {
    return this.instrumento2Service.listarExpertosDisponibles();
  }

  @Get(':id')
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO)
  @ApiOperation({ summary: 'Obtener el detalle de un instrumento 2' })
  @ApiParam({ name: 'id', example: 42 })
  @ApiResponse({ status: 200, type: Instrumento2DetailDto })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Instrumento2DetailDto> {
    return this.instrumento2Service.findById(id);
  }

  @Get(':id/comparacion')
  @ApiOperation({ summary: 'Obtener los detalles de todas las ocupaciones asociadas al instrumento para comparación' })
  @ApiParam({ name: 'id', example: 7 })
  @ApiResponse({ status: 200, description: 'Lista de ocupaciones del instrumento', type: [Instrumento2DetailDto] })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado' })
  getComparacion(@Param('id', ParseIntPipe) id: number): Promise<Instrumento2DetailDto[]> {
    return this.instrumento2Service.getComparacion(id);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE)
  @Patch(':id')
  @ApiOperation({ summary: 'Editar campos del instrumento 2 (marca estado EN_REVISION)' })
  @ApiParam({ name: 'id', example: 42 })
  @ApiBody({ type: UpdateInstrumento2Dto })
  @ApiResponse({ status: 200, type: Instrumento2DetailDto })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado' })
  @ApiResponse({ status: 409, description: 'Ya fue enviado a experto y no admite edición' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInstrumento2Dto,
  ): Promise<Instrumento2DetailDto> {
    return this.instrumento2Service.update(id, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE)
  @Post(':id/guardar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar edición explícita: transiciona a GUARDADO' })
  @ApiParam({ name: 'id', example: 42 })
  @ApiResponse({ status: 200, type: Instrumento2DetailDto })
  @ApiResponse({ status: 400, description: 'Faltan datos obligatorios (nombre y al menos una función)' })
  @ApiResponse({ status: 409, description: 'Ya fue enviado a experto' })
  guardar(@Param('id', ParseIntPipe) id: number): Promise<Instrumento2DetailDto> {
    return this.instrumento2Service.guardar(id);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE)
  @Post(':id/enviar-experto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Enviar a validación experta las ocupaciones elegidas (1 a 3) a los expertos elegidos (requiere estado GUARDADO)',
  })
  @ApiParam({ name: 'id', example: 42 })
  @ApiBody({ type: EnviarExpertoInstrumento2Dto })
  @ApiResponse({ status: 200, type: Instrumento2DetailDto })
  @ApiResponse({
    status: 400,
    description:
      'Sin expertos o alguno no es un experto activo; o sin ocupaciones, más de 3, o alguna no es del instrumento',
  })
  @ApiResponse({ status: 409, description: 'El instrumento debe estar en estado GUARDADO' })
  enviarExperto(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnviarExpertoInstrumento2Dto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Instrumento2DetailDto> {
    return this.instrumento2Service.enviarExperto(id, dto.expertos, dto.ocupaciones, user);
  }

  // ─── Validación experta ────────────────────────────────────────────────────
  // El @Auth a nivel de método reemplaza al del controlador (getAllAndOverride):
  // aquí sí entra el rol EXPERTO, que es quien realiza la validación.

  @Get(':id/validacion-experta')
  @Auth(Role.ADMINISTRADOR, Role.EXPERTO, Role.ANALISTA, Role.APE)
  @ApiOperation({ summary: 'Obtener la validación del usuario en sesión (cada experto ve solo la suya)' })
  @ApiParam({ name: 'id', example: 8 })
  @ApiResponse({ status: 200, description: 'Validación guardada, o null si aún no ha guardado', type: ValidacionExpertaDto })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado' })
  getValidacionExperta(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ValidacionExpertaDto | null> {
    return this.instrumento2Service.getValidacionExperta(id, user);
  }

  @Get(':id/validacion-experta/avance')
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE)
  @ApiOperation({ summary: 'Expertos asignados en la ronda vigente y en qué va cada uno' })
  @ApiParam({ name: 'id', example: 8 })
  @ApiResponse({ status: 200, type: AvanceValidacionDto })
  getAvanceValidacion(@Param('id', ParseIntPipe) id: number): Promise<AvanceValidacionDto> {
    return this.instrumento2Service.getAvanceValidacion(id);
  }

  @Post(':id/cerrar-validacion')
  @HttpCode(HttpStatus.OK)
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @ApiOperation({
    summary: 'Cerrar la validación aunque falten expertos (consolida las validaciones ya cerradas)',
  })
  @ApiParam({ name: 'id', example: 8 })
  @ApiResponse({ status: 200, type: AvanceValidacionDto })
  @ApiResponse({ status: 409, description: 'No está enviado a experto, o ningún experto ha cerrado' })
  cerrarValidacion(@Param('id', ParseIntPipe) id: number): Promise<AvanceValidacionDto> {
    return this.instrumento2Service.cerrarValidacion(id);
  }

  @Post(':id/validacion-experta')
  @HttpCode(HttpStatus.OK)
  @Auth(Role.ADMINISTRADOR, Role.EXPERTO)
  @ApiOperation({ summary: 'Guardar la validación del experto en sesión (upsert: revalidar reemplaza la suya)' })
  @ApiParam({ name: 'id', example: 8 })
  @ApiBody({ type: GuardarValidacionExpertaDto })
  @ApiResponse({ status: 200, type: ValidacionExpertaDto })
  @ApiResponse({ status: 404, description: 'Instrumento no encontrado' })
  @ApiResponse({ status: 403, description: 'El experto no está asignado a este instrumento' })
  @ApiResponse({ status: 409, description: 'El instrumento no está abierto a validación' })
  guardarValidacionExperta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarValidacionExpertaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ValidacionExpertaDto> {
    return this.instrumento2Service.guardarValidacionExperta(id, dto, user);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE)
  @Delete(':id/ocupacion/:codigo')
  @ApiOperation({ summary: 'Eliminar una sola ocupación del instrumento (deja el resto del grupo)' })
  @ApiParam({ name: 'id', example: 8 })
  @ApiParam({ name: 'codigo', example: '5122-20' })
  @ApiResponse({ status: 200, description: 'Comparación resultante (vacía si el instrumento dejó de existir)', type: [Instrumento2DetailDto] })
  @ApiResponse({ status: 404, description: 'La ocupación no pertenece al instrumento' })
  @ApiResponse({ status: 409, description: 'El instrumento ya fue enviado a experto' })
  removeOcupacion(
    @Param('id', ParseIntPipe) id: number,
    @Param('codigo') codigo: string,
  ): Promise<Instrumento2DetailDto[]> {
    return this.instrumento2Service.eliminarOcupacion(id, codigo);
  }

  // TEMPORAL — SOLO PARA PRUEBAS: eliminar este endpoint junto con
  // Instrumento2Service.remove() y el botón "Eliminar" del frontend.
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE)
  @Delete(':id')
  @ApiOperation({ summary: '[TEMPORAL - solo pruebas] Eliminar un instrumento 2' })
  @ApiParam({ name: 'id', example: 42 })
  @ApiResponse({ status: 200, description: 'Eliminado' })
  @ApiResponse({ status: 409, description: 'No se puede eliminar: ya fue enviado a experto' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<{ success: boolean }> {
    return this.instrumento2Service.remove(id);
  }
}
