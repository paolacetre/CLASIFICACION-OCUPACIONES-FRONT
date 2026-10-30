import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { BitacoraService } from './bitacora.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Bitácora')
@Auth(Role.ADMINISTRADOR, Role.ANALISTA, Role.EXPERTO, Role.APE, Role.TENDENCIAS_OCUPACIONES)
@Controller('api/bitacora')
export class BitacoraController {
  constructor(private readonly bitacoraService: BitacoraService) {}

  @Get()
  @ApiOperation({ summary: 'Actividad reciente del usuario en sesión (Bitácora de Trazabilidad)' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Filas más recientes primero' })
  listarRecientes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.bitacoraService.listarRecientes(user.idUsuario, limit);
  }
}
