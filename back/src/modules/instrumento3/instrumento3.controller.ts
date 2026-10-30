import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Instrumento3Service } from './instrumento3.service';
import {
  CreateInstrumento3Dto,
  Instrumento3DetailDto,
  UpdateInstrumento3Dto,
} from './dto/instrumento3.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../../common/enums/role.enum';
import { ValidacionExpertaService } from '../validacion-experta/validacion-experta.service';
import { GuardarValidacionExpertaDto, ValidacionExpertaDto } from '../validacion-experta/dto/validacion-experta.dto';
import { TIPO_INSTRUMENTO3 } from './enums/instrumento3-estado.enum';

@ApiTags('Instrumento 3')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO)
@Controller('api/instrumento3')
export class Instrumento3Controller {
  constructor(
    private readonly instrumento3Service: Instrumento3Service,
    private readonly validacionExpertaService: ValidacionExpertaService,
  ) {}

  @Get()
  // EXPERTO necesita leer para su bandeja de validación, pero no editar
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO)
  @ApiOperation({ summary: 'Listar propuestas de Instrumento 3' })
  @ApiResponse({ status: 200, type: [Instrumento3DetailDto] })
  findAll(): Promise<Instrumento3DetailDto[]> {
    return this.instrumento3Service.findAll();
  }

  @Get(':id')
  @Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE, Role.EXPERTO)
  @ApiOperation({ summary: 'Obtener el detalle de una propuesta' })
  @ApiParam({ name: 'id', example: 15 })
  @ApiResponse({ status: 200, type: Instrumento3DetailDto })
  @ApiResponse({ status: 404, description: 'Propuesta no encontrada' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Instrumento3DetailDto> {
    return this.instrumento3Service.findById(id);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post()
  @ApiOperation({ summary: 'Crear una propuesta (queda en estado BORRADOR)' })
  @ApiBody({ type: CreateInstrumento3Dto })
  @ApiResponse({ status: 201, type: Instrumento3DetailDto })
  create(
    @Body() dto: CreateInstrumento3Dto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Instrumento3DetailDto> {
    return this.instrumento3Service.create(dto, user?.idUsuario);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Patch(':id')
  @ApiOperation({ summary: 'Editar una propuesta (vuelve a BORRADOR)' })
  @ApiParam({ name: 'id', example: 15 })
  @ApiBody({ type: UpdateInstrumento3Dto })
  @ApiResponse({ status: 200, type: Instrumento3DetailDto })
  @ApiResponse({ status: 409, description: 'Ya fue enviada a experto y no admite edición' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInstrumento3Dto,
  ): Promise<Instrumento3DetailDto> {
    return this.instrumento3Service.update(id, dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post(':id/guardar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar la edición: transiciona a GUARDADO' })
  @ApiParam({ name: 'id', example: 15 })
  @ApiResponse({ status: 200, type: Instrumento3DetailDto })
  @ApiResponse({ status: 409, description: 'Falta el nombre de la ocupación, o ya fue enviada' })
  guardar(@Param('id', ParseIntPipe) id: number): Promise<Instrumento3DetailDto> {
    return this.instrumento3Service.guardar(id);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post(':id/enviar-experto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar a validación experta (requiere estado GUARDADO)' })
  @ApiParam({ name: 'id', example: 15 })
  @ApiResponse({ status: 200, type: Instrumento3DetailDto })
  @ApiResponse({ status: 409, description: 'La propuesta debe estar en estado GUARDADO' })
  enviarExperto(@Param('id', ParseIntPipe) id: number): Promise<Instrumento3DetailDto> {
    return this.instrumento3Service.enviarExperto(id);
  }

  // ─── Validación experta ────────────────────────────────────────────────────
  // Mismos endpoints que Instrumento 2, delegando en el servicio compartido:
  // el experto trata ambos instrumentos igual.

  @Get(':id/validacion-experta')
  @Auth(Role.ADMINISTRADOR, Role.EXPERTO, Role.ANALISTA, Role.APE)
  @ApiOperation({ summary: 'Obtener el veredicto del experto sobre la propuesta' })
  @ApiParam({ name: 'id', example: 15 })
  @ApiResponse({ status: 200, description: 'Validación guardada, o null si aún no se ha validado', type: ValidacionExpertaDto })
  @ApiResponse({ status: 404, description: 'Propuesta no encontrada' })
  getValidacionExperta(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ValidacionExpertaDto | null> {
    return this.validacionExpertaService.getValidacion(id, user, TIPO_INSTRUMENTO3);
  }

  @Post(':id/validacion-experta')
  @HttpCode(HttpStatus.OK)
  @Auth(Role.ADMINISTRADOR, Role.EXPERTO)
  @ApiOperation({ summary: 'Guardar la validación experta (upsert: revalidar reemplaza el anterior)' })
  @ApiParam({ name: 'id', example: 15 })
  @ApiBody({ type: GuardarValidacionExpertaDto })
  @ApiResponse({ status: 200, type: ValidacionExpertaDto })
  @ApiResponse({ status: 409, description: 'La propuesta aún no fue enviada a experto' })
  guardarValidacionExperta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarValidacionExpertaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ValidacionExpertaDto> {
    return this.validacionExpertaService.guardar(id, dto, user, TIPO_INSTRUMENTO3);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una propuesta que aún no fue enviada a experto' })
  @ApiParam({ name: 'id', example: 15 })
  @ApiResponse({ status: 200, description: 'Eliminada' })
  @ApiResponse({ status: 409, description: 'Ya fue enviada a experto' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<{ success: boolean }> {
    return this.instrumento3Service.remove(id);
  }
}
