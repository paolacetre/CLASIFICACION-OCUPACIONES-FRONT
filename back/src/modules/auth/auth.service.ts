import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Usuario } from '../usuario/entities/usuario.entity';
import { esCorreoSena } from '../usuario/usuario.service';
import { UsuarioRol } from './entities/usuario-rol.entity';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Role } from '../../common/enums/role.enum';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { BCRYPT_COSTO_MIN, cifrarContrasena, esHashBcrypt, problemaContrasena } from '../../common/utils/politica-contrasena';

/** Hash de una contraseña que nadie conoce, para gastar el mismo tiempo cuando el usuario no existe. */
const HASH_FICTICIO = bcrypt.hashSync('sin-cuenta-' + Math.random().toString(36), BCRYPT_COSTO_MIN);

const CORREO_EXTERNO =
  'Solo los correos del SENA sirven para ingresar. Si tu correo es de otro dominio, ingresa con tu número de cédula.';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(UsuarioRol)
    private readonly usuarioRolRepository: Repository<UsuarioRol>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto) {
    const { identifier, password, portal } = loginDto;
    const idNormalizado = (identifier ?? '').trim().toLowerCase();

    // Con correo externo el usuario de acceso es la cédula, así que solo los
    // correos SENA sirven para ingresar (las cuentas externas, nuevas y
    // antiguas, siempre tienen cédula). Depende solo de lo escrito, no de si
    // la cuenta existe, así que avisarlo no revela nada.
    if (idNormalizado.includes('@') && !esCorreoSena(idNormalizado)) {
      throw new UnauthorizedException(CORREO_EXTERNO);
    }

    // Búsqueda case-insensitive por nombre de usuario, correo SENA o cédula (el
    // formulario pide "Correo SENA o Documento").
    const usuario = await this.usuarioRepository
      .createQueryBuilder('u')
      .where('LOWER(u.usuario) = :id OR LOWER(u.correo) = :id OR u.documento = :id', { id: idNormalizado })
      .getOne();

    if (!usuario) {
      // Se compara igual contra un hash ficticio: sin esto, «no existe» respondía
      // al instante y «clave errada» tardaba lo que tarda bcrypt, y midiendo el
      // tiempo se podía saber qué correos tienen cuenta.
      await bcrypt.compare(password, HASH_FICTICIO);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificación criptográfica con bcrypt
    let passwordValida = false;
    try {
      passwordValida = await bcrypt.compare(password, usuario.contrasena);
    } catch {
      passwordValida = false;
    }

    // Respaldo y migración en caliente: si la contraseña en BD estaba en texto
    // plano y coincide exactamente, se cambia de inmediato por su hash bcrypt.
    // Solo para valores que NO son ya un hash: si no, quien consiguiera el hash
    // podía entrar escribiéndolo tal cual como contraseña.
    if (!passwordValida && !esHashBcrypt(usuario.contrasena) && usuario.contrasena === password) {
      usuario.contrasena = await cifrarContrasena(password, this.configService.get<number>('jwt.bcryptSalt'));
      await this.usuarioRepository.save(usuario);
      passwordValida = true;
    }

    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (usuario.estado !== 1) {
      throw new UnauthorizedException('Tu cuenta está inactiva. Contacta a un administrador.');
    }

    const usuarioRol = await this.usuarioRolRepository.findOne({
      where: { idUsuario: usuario.idUsuario },
      relations: ['rol'],
    });

    const dbRole = usuarioRol?.rol?.nombre || 'ANALISTA';

    // El acceso APE es exclusivo de la Agencia Publica de Empleo: se rechaza aqui,
    // antes de firmar el token, para que no dependa solo del formulario.
    // Va como 401 y no 403 porque el interceptor del frontend convierte cualquier
    // 403 en un aviso generico de permisos que taparia este mensaje.
    const esApe = dbRole.toUpperCase() === Role.APE;
    if (portal === 'ape' && !esApe) {
      throw new UnauthorizedException(
        'Estas credenciales no corresponden a un usuario de la APE. Ingresa desde el acceso principal.',
      );
    }
    // Y al reves: el usuario APE solo entra por "Usuario de la APE". Sin
    // portal cuenta como 'general', para que omitir el campo no lo salte.
    if (portal !== 'ape' && esApe) {
      throw new UnauthorizedException(
        'Los usuarios de la APE deben ingresar desde la opción "Usuario de la APE".',
      );
    }

    const payload: JwtPayload = { idusuario: usuario.idUsuario, correo: usuario.usuario, rol: dbRole as Role };
    const token = await this.jwtService.signAsync(payload);
    // La cookie vence junto con el token: se toma el `exp` que acaba de firmarse
    // en vez de volver a interpretar JWT_EXPIRES_IN ('1d', '8h', segundos...).
    const { exp } = this.jwtService.decode<{ exp: number }>(token);

    return {
      token,
      expiraEn: new Date(exp * 1000),
      user: this.toPerfilUsuario(usuario, dbRole),
    };
  }

  /**
   * Datos del usuario autenticado, leidos de base en cada llamada.
   *
   * El JWT solo transporta id, correo y rol -lo minimo para autorizar-, asi que
   * el nombre real hay que ir a buscarlo. Lo consume el frontend para precargar
   * los formularios que pide el usuario en sesion (por ejemplo los datos
   * generales del informante en Validacion Experta) en vez de dejarlos vacios o,
   * peor, con valores de ejemplo.
   */
  async perfilActual(idUsuario: number) {
    const usuario = await this.usuarioRepository.findOne({ where: { idUsuario } });
    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const usuarioRol = await this.usuarioRolRepository.findOne({
      where: { idUsuario: usuario.idUsuario },
      relations: ['rol'],
    });

    return this.toPerfilUsuario(usuario, usuarioRol?.rol?.nombre || 'ANALISTA');
  }

  async updateProfile(idUsuario: number, dto: UpdateProfileDto) {
    const usuario = await this.usuarioRepository.findOne({ where: { idUsuario } });
    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (dto.nombreApellido !== undefined) {
      usuario.nombreApellido = dto.nombreApellido.trim();
    }
    if (dto.telefono !== undefined) {
      usuario.telefono = dto.telefono.trim();
    }

    await this.usuarioRepository.save(usuario);

    const usuarioRol = await this.usuarioRolRepository.findOne({
      where: { idUsuario: usuario.idUsuario },
      relations: ['rol'],
    });

    return this.toPerfilUsuario(usuario, usuarioRol?.rol?.nombre || 'ANALISTA');
  }

  /**
   * Forma unica del usuario que ve el frontend, para que `login` y `perfilActual`
   * no puedan divergir.
   *
   * `nombreApellido` viaja en un solo campo, tal como esta en la tabla
   * (`usuario.nombre_apellido`): no hay corte fiable para partirlo.
   *
   * Sin valores de relleno: si la columna esta vacia se manda cadena vacia y es
   * la pantalla la que decide que hacer. Rellenar con 'Usuario' o 'Sistema'
   * hacia imposible distinguir un dato ausente de uno real.
   */
  private toPerfilUsuario(usuario: Usuario, rol: string) {
    return {
      id: usuario.idUsuario,
      email: usuario.correo || usuario.usuario,
      usuario: usuario.usuario,
      nombreApellido: usuario.nombreApellido || '',
      telefono: usuario.telefono || '',
      role: rol,
      // El frontend lleva al usuario a cambiarla; el backend, mientras tanto,
      // le niega todo lo demás (JwtAuthGuard).
      debeCambiarContrasena: usuario.debeCambiarContrasena === true,
    };
  }

  async changePassword(idUsuario: number, dto: ChangePasswordDto): Promise<{ message: string }> {
    const usuario = await this.usuarioRepository.findOne({ where: { idUsuario } });
    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // compare lanza si lo guardado no es un hash válido: eso es «no coincide», no un error 500.
    const passwordActualValida = await bcrypt.compare(dto.currentPassword, usuario.contrasena).catch(() => false);
    if (!passwordActualValida) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    }
    // Incluye no reutilizar la cédula, que es la contraseña temporal de los
    // importados: volver a ponerla dejaría la cuenta igual de expuesta.
    const problema = problemaContrasena(dto.newPassword, {
      nombreApellido: usuario.nombreApellido,
      correo: usuario.correo,
      usuario: usuario.usuario,
      documento: usuario.documento,
    });
    if (problema) throw new BadRequestException(problema);

    usuario.contrasena = await cifrarContrasena(dto.newPassword, this.configService.get<number>('jwt.bcryptSalt'));
    usuario.debeCambiarContrasena = false;
    await this.usuarioRepository.save(usuario);

    return { message: 'Contraseña actualizada correctamente' };
  }
}
