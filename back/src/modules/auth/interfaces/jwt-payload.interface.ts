import { Role } from '../../../common/enums/role.enum';

/** Payload firmado dentro del JWT. Solo lo estrictamente necesario. */
export interface JwtPayload {
  idusuario: number;
  correo: string;
  rol: Role;
}

/** Forma de `request.user` una vez que `JwtStrategy.validate()` lo resuelve. */
export interface AuthenticatedUser {
  idUsuario: number;
  correo: string;
  rol: Role;
  /** Leído de la BD en cada request (no va en el JWT): cambiarla libera la sesión al instante. */
  debeCambiarContrasena?: boolean;
}
