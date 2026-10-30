import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { AnalisisService, GuardarAnalisisResponse } from './analisis.service';
import { GuardarAnalisisDto } from './dto/guardar-analisis.dto';
import { BuscarOpcionesDto } from './dto/buscar-opciones.dto';
import { AnalisisOpcionesService, OpcionExistente } from './analisis-opciones.service';
import { GuardarOcupacionAnalisis2Dto } from './dto/guardar-ocupacion-analisis2.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../../common/enums/role.enum';

@ApiTags('Análisis')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.APE)
@Controller('api/analisis')
export class AnalisisController {
  constructor(
    private readonly analisisService: AnalisisService,
    private readonly opcionesService: AnalisisOpcionesService,
  ) {}

  @Get('opciones')
  @ApiOperation({
    summary: 'Funciones, denominaciones, habilidades o conocimientos existentes para agregar a una ocupación',
  })
  opciones(@Query() dto: BuscarOpcionesDto): Promise<OpcionExistente[]> {
    return this.opcionesService.buscar(dto);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Post('guardar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Guardar resultado de análisis CNO vs CUOC' })
  @ApiBody({ type: GuardarAnalisisDto })
  @ApiResponse({ status: 201, description: 'Análisis guardado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  guardar(
    @Body() dto: GuardarAnalisisDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GuardarAnalisisResponse> {
    // idUsuario siempre sale del JWT, nunca del body: evita depender de que el
    // cliente lo mande (y de que exista un usuario "id=1" por defecto) y evita
    // que alguien pueda atribuir un análisis a un usuario que no es el suyo.
    return this.analisisService.guardarAnalisis(dto, user.idUsuario);
  }

  @Auth(Role.ADMINISTRADOR, Role.ANALISTA)
  @Put('ocupacion-original')
  @ApiOperation({
    summary: 'Actualización: guarda la edición sobre la ocupación ORIGINAL del catálogo (conserva códigos; inactiva lo que se quita)',
  })
  @ApiBody({ type: GuardarOcupacionAnalisis2Dto })
  @ApiResponse({ status: 200, description: 'Ocupación original actualizada' })
  @ApiResponse({ status: 409, description: 'El código corresponde a una copia de Análisis' })
  actualizarOriginal(@Body() dto: GuardarOcupacionAnalisis2Dto): Promise<{ codigo: string }> {
    return this.analisisService.actualizarOcupacionOriginal(dto);
  }
}
