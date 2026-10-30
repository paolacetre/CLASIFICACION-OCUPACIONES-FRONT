import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CODIGO_CAMBIO_CONTRASENA, PERMITE_CAMBIO_PENDIENTE_KEY } from '../decorators/permite-cambio-pendiente.decorator';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';
import { apiKeyDe, limpiarFallos, registrarFallo, resolverApiKey, verificarBloqueo } from '../api-key';

/** Solo lectura: una API key nunca puede crear, editar ni borrar. */
const METODOS_API_KEY = new Set(['GET', 'HEAD']);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    // Sistemas externos (APE, Tendencias): se autentican con API key en vez de
    // sesión. Si la cabecera viene, manda ella: una llave inválida es 401 aunque
    // haya cookie, para que un error de configuración no pase desapercibido.
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser; apiKeyConsumidor?: string }>();
    const valor = apiKeyDe(req);
    if (valor !== undefined) {
      const ip = req.ip ?? 'desconocida';
      verificarBloqueo(ip, context.switchToHttp().getResponse<Response>());
      const consumidor = resolverApiKey(valor);
      if (!consumidor) {
        registrarFallo(ip);
        throw new UnauthorizedException('API key inválida.');
      }
      limpiarFallos(ip);
      if (!consumidor.rol) {
        throw new ForbiddenException('Esta API key solo da acceso a /api/public/consulta.');
      }
      if (!METODOS_API_KEY.has((req.method ?? '').toUpperCase())) {
        throw new ForbiddenException('La API key solo permite consultas (GET).');
      }
      // idUsuario 0: no es una persona. RolesGuard decide con el rol de la llave.
      req.user = { idUsuario: 0, correo: `api-key:${consumidor.nombre}`, rol: consumidor.rol };
      req.apiKeyConsumidor = consumidor.nombre;
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Con la contraseña temporal (la cédula que asigna la importación en lote) la
   * sesión solo sirve para cambiarla. Se corta aquí, en el backend, para que no
   * dependa de que el frontend redirija.
   */
  handleRequest<TUser = AuthenticatedUser>(err: unknown, user: unknown, info: unknown, context: ExecutionContext): TUser {
    const autenticado = super.handleRequest<TUser>(err, user, info, context) as AuthenticatedUser;
    if (autenticado?.debeCambiarContrasena) {
      const permitido = this.reflector.getAllAndOverride<boolean>(PERMITE_CAMBIO_PENDIENTE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!permitido) {
        throw new ForbiddenException({
          message: 'Debes cambiar tu contraseña temporal antes de continuar.',
          codigo: CODIGO_CAMBIO_CONTRASENA,
        });
      }
    }
    return autenticado as TUser;
  }
}
