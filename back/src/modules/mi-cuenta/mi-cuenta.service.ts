import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Usuario } from '../usuario/entities/usuario.entity';
import { UsuarioCuenta } from './entities/usuario-cuenta.entity';
import { ActualizarPerfilDto, PerfilAnalistaDto } from './dto/mi-cuenta.dto';

/** Las preferencias son un objeto libre: se acota el tamaño para que no se use de almacén. */
const MAX_PREFERENCIAS = 20_000;

export interface PerfilCuenta {
  email: string;
  nombreApellido: string;
  telefono: string;
  descripcion: string;
  avatar: string | null;
}

@Injectable()
export class MiCuentaService {
  constructor(
    @InjectRepository(UsuarioCuenta)
    private readonly cuentaRepository: Repository<UsuarioCuenta>,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    private readonly dataSource: DataSource,
  ) {}

  async obtenerPreferencias(idUsuario: number): Promise<Record<string, unknown>> {
    const cuenta = await this.cuentaRepository.findOne({ where: { idUsuario } });
    return cuenta?.preferencias ?? {};
  }

  async guardarPreferencias(idUsuario: number, preferencias: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (JSON.stringify(preferencias).length > MAX_PREFERENCIAS) {
      throw new BadRequestException('Las preferencias superan el tamaño permitido.');
    }
    const cuenta = await this.cuentaDe(idUsuario);
    cuenta.preferencias = preferencias;
    await this.cuentaRepository.save(cuenta);
    return cuenta.preferencias;
  }

  async obtenerPerfil(idUsuario: number): Promise<PerfilCuenta> {
    const usuario = await this.usuarioDe(idUsuario);
    const cuenta = await this.cuentaRepository.findOne({ where: { idUsuario } });
    return this.aPerfil(usuario, cuenta);
  }

  /**
   * Nombre y apellido, y teléfono van a `usuario` (los mismos que ve la
   * administración de usuarios); descripción y avatar a `usuario_cuenta`. En
   * una transacción para no dejar la mitad guardada. El correo no se cambia
   * desde aquí: es con lo que se inicia sesión y lo administra el ADMINISTRADOR.
   */
  async actualizarPerfil(idUsuario: number, dto: ActualizarPerfilDto): Promise<PerfilCuenta> {
    return this.dataSource.transaction(async (manager) => {
      const usuario = await manager.findOne(Usuario, { where: { idUsuario } });
      if (!usuario) throw new UnauthorizedException('Usuario no encontrado');

      if (dto.nombreApellido !== undefined) usuario.nombreApellido = dto.nombreApellido.trim();
      if (dto.telefono !== undefined) usuario.telefono = dto.telefono.trim();
      await manager.save(usuario);

      const cuenta =
        (await manager.findOne(UsuarioCuenta, { where: { idUsuario } })) ?? this.cuentaNueva(idUsuario);
      if (dto.descripcion !== undefined) cuenta.descripcion = dto.descripcion.trim() || null;
      if (dto.avatar !== undefined) cuenta.avatar = dto.avatar;
      await manager.save(cuenta);

      return this.aPerfil(usuario, cuenta);
    });
  }

  async obtenerPerfilAnalista(idUsuario: number): Promise<Record<string, string> | null> {
    const cuenta = await this.cuentaRepository.findOne({ where: { idUsuario } });
    return cuenta?.perfilAnalista ?? null;
  }

  async guardarPerfilAnalista(idUsuario: number, dto: PerfilAnalistaDto): Promise<Record<string, string>> {
    const cuenta = await this.cuentaDe(idUsuario);
    cuenta.perfilAnalista = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, (v as string).trim()]),
    );
    await this.cuentaRepository.save(cuenta);
    return cuenta.perfilAnalista;
  }

  private async cuentaDe(idUsuario: number): Promise<UsuarioCuenta> {
    return (await this.cuentaRepository.findOne({ where: { idUsuario } })) ?? this.cuentaNueva(idUsuario);
  }

  private cuentaNueva(idUsuario: number): UsuarioCuenta {
    return this.cuentaRepository.create({
      idUsuario,
      preferencias: {},
      descripcion: null,
      avatar: null,
      perfilAnalista: null,
    });
  }

  private async usuarioDe(idUsuario: number): Promise<Usuario> {
    const usuario = await this.usuarioRepository.findOne({ where: { idUsuario } });
    if (!usuario) throw new UnauthorizedException('Usuario no encontrado');
    return usuario;
  }

  private aPerfil(usuario: Usuario, cuenta: UsuarioCuenta | null): PerfilCuenta {
    return {
      email: usuario.correo || usuario.usuario || '',
      nombreApellido: usuario.nombreApellido || '',
      telefono: usuario.telefono || '',
      descripcion: cuenta?.descripcion ?? '',
      avatar: cuenta?.avatar ?? null,
    };
  }
}
