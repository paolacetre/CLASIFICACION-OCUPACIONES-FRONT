import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PermiteCambioPendiente } from '../auth/decorators/permite-cambio-pendiente.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { ActualizarPerfilDto, PerfilAnalistaDto, PreferenciasDto } from './dto/mi-cuenta.dto';
import { MiCuentaService } from './mi-cuenta.service';

/** Datos del propio usuario en sesión. Sin roles: cualquiera autenticado gestiona lo suyo. */
@ApiTags('Mi cuenta')
@Auth()
@Controller('api/mi-cuenta')
export class MiCuentaController {
  constructor(private readonly miCuentaService: MiCuentaService) {}

  // Tema e idioma de la pantalla de cambio de contraseña: se leen y guardan
  // aunque la contraseña sea temporal. No exponen nada del sistema.
  @Get('preferencias')
  @PermiteCambioPendiente()
  @ApiOperation({ summary: 'Preferencias de interfaz del usuario en sesión' })
  obtenerPreferencias(@CurrentUser() user: AuthenticatedUser) {
    return this.miCuentaService.obtenerPreferencias(user.idUsuario);
  }

  @Put('preferencias')
  @PermiteCambioPendiente()
  @ApiOperation({ summary: 'Reemplaza las preferencias de interfaz del usuario en sesión' })
  @ApiResponse({ status: 400, description: 'No es un objeto o supera 20 KB' })
  guardarPreferencias(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreferenciasDto) {
    return this.miCuentaService.guardarPreferencias(user.idUsuario, dto.preferencias);
  }

  @Get('perfil')
  @ApiOperation({ summary: 'Perfil del usuario en sesión (nombre y apellido, teléfono, descripción y avatar)' })
  obtenerPerfil(@CurrentUser() user: AuthenticatedUser) {
    return this.miCuentaService.obtenerPerfil(user.idUsuario);
  }

  @Patch('perfil')
  @ApiOperation({ summary: 'Actualiza el perfil del usuario en sesión (el correo no se cambia aquí)' })
  actualizarPerfil(@CurrentUser() user: AuthenticatedUser, @Body() dto: ActualizarPerfilDto) {
    return this.miCuentaService.actualizarPerfil(user.idUsuario, dto);
  }

  @Get('perfil-analista')
  @ApiOperation({ summary: 'Datos del informante con que se precarga Instrumento 3 (null si nunca se guardaron)' })
  obtenerPerfilAnalista(@CurrentUser() user: AuthenticatedUser) {
    return this.miCuentaService.obtenerPerfilAnalista(user.idUsuario);
  }

  @Put('perfil-analista')
  @ApiOperation({ summary: 'Guarda los datos del informante para precargar Instrumento 3' })
  guardarPerfilAnalista(@CurrentUser() user: AuthenticatedUser, @Body() dto: PerfilAnalistaDto) {
    return this.miCuentaService.guardarPerfilAnalista(user.idUsuario, dto);
  }
}
