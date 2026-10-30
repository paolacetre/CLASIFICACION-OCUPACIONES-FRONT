import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { Usuario } from '../../usuario/entities/usuario.entity';
import { JwtPayload, AuthenticatedUser } from '../interfaces/jwt-payload.interface';
import { tokenDeSesion } from '../sesion-cookie';
import { SesionesRevocadasService } from '../sesiones-revocadas.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly sesionesRevocadas: SesionesRevocadasService,
  ) {
    super({
      // Cookie httpOnly para el frontend; Bearer se conserva para clientes que
      // no son navegador (scripts, pruebas).
      jwtFromRequest: tokenDeSesion,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
      passReqToCallback: true,
    });
  }

  /**
   * Se ejecuta en cada request autenticado. Se vuelve a consultar el estado del
   * usuario para que, si lo desactivan, el token deje de servir de inmediato
   * aunque todavía no haya expirado; y se rechaza el token si su sesión ya se
   * cerró (una copia del token no sirve después de «Cerrar sesión»).
   */
  async validate(req: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    const token = tokenDeSesion(req);
    if (token && (await this.sesionesRevocadas.estaRevocado(token))) {
      throw new UnauthorizedException('La sesión ya se cerró. Inicia sesión nuevamente.');
    }

    const usuario = await this.usuarioRepository.findOne({ where: { idUsuario: payload.idusuario } });

    if (!usuario || usuario.estado !== 1) {
      throw new UnauthorizedException('La sesión ya no es válida. Inicia sesión nuevamente.');
    }

    return {
      idUsuario: payload.idusuario,
      correo: payload.correo,
      rol: payload.rol,
      debeCambiarContrasena: usuario.debeCambiarContrasena === true,
    };
  }
}
