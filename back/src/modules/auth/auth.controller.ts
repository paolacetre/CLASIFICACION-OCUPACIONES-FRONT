import { Controller, Post, Patch, Get, Body, UseGuards, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { COOKIE_SESION, opcionesCookieSesion, tokenDeSesion } from './sesion-cookie';
import { SesionesRevocadasService } from './sesiones-revocadas.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { PermiteCambioPendiente } from './decorators/permite-cambio-pendiente.decorator';
import { AuthenticatedUser } from './interfaces/jwt-payload.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sesionesRevocadas: SesionesRevocadasService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Iniciar sesión con correo y contraseña' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 201,
    description: 'Autenticación exitosa: fija la cookie httpOnly de sesión y devuelve los datos del usuario',
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas o cuenta inactiva' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos de inicio de sesión, intenta más tarde' })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, expiraEn, user } = await this.authService.login(loginDto);
    // El token no va en el cuerpo: si viajara, el frontend tendría que
    // guardarlo en algún sitio legible por JavaScript, que es justo lo que se
    // quiere evitar.
    res.cookie(COOKIE_SESION, token, opcionesCookieSesion(expiraEn.getTime() - Date.now()));
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión (invalida el token y borra la cookie de sesión)' })
  @ApiResponse({ status: 204, description: 'Sesión cerrada' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    // Sin guard: cerrar sesión con una cookie ya vencida también debe borrarla.
    // Borrar la cookie no basta: una copia del token seguiría sirviendo hasta
    // vencer, así que además se revoca.
    const token = tokenDeSesion(req);
    if (token) await this.sesionesRevocadas.revocar(token);
    res.clearCookie(COOKIE_SESION, opcionesCookieSesion());
  }

  /**
   * Usuario en sesion, con su nombre real leido de base.
   *
   * El JWT solo lleva id, correo y rol, asi que el frontend no tenia de donde
   * sacar el nombre y acababa inventandolo a partir del correo. Este endpoint
   * es la fuente para precargar formularios con los datos de quien esta
   * trabajando.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @PermiteCambioPendiente()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Datos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario en sesion' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.perfilActual(user.idUsuario);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @PermiteCambioPendiente()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar la contraseña del usuario autenticado (requiere la contraseña actual)' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada correctamente' })
  @ApiResponse({ status: 400, description: 'La nueva contraseña es igual a la actual o al número de documento' })
  @ApiResponse({ status: 401, description: 'No autenticado o contraseña actual incorrecta' })
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.idUsuario, dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar datos de perfil del usuario autenticado (nombre y apellido, teléfono)' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Perfil actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.idUsuario, dto);
  }
}
