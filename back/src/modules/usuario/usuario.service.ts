import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, Repository } from 'typeorm';
import { isEmail } from 'class-validator';
import { cifrarContrasena } from '../../common/utils/politica-contrasena';
import { Usuario } from './entities/usuario.entity';
import { Rol } from '../auth/entities/rol.entity';
import { UsuarioRol } from '../auth/entities/usuario-rol.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { Role, parseRole, roleToFrontendKey, FrontendRoleKey } from '../../common/enums/role.enum';
import { PaginationDto, PageResponse, buildPageResponse } from '../../common/dto/pagination.dto';

/** Cédula colombiana: solo dígitos, igual que acepta el formulario de login. */
const CEDULA_REGEX = /^\d{5,12}$/;

/** Correo institucional: con él, el usuario de acceso es el propio correo. */
const DOMINIO_SENA = /@(sena\.edu\.co|soy\.sena\.edu\.co)$/i;

export function esCorreoSena(correo: string | null | undefined): boolean {
  return DOMINIO_SENA.test((correo ?? '').trim());
}

/** "1.193.847.562 " → "1193847562". */
export function normalizarDocumento(valor: unknown): string {
  return (valor ?? '').toString().replace(/[.\s]/g, '');
}

/**
 * Valor de la columna `usuario`: el correo si es del SENA; si no, la cédula.
 * `null` cuando no hay correo SENA ni cédula, es decir, no hay con qué armarlo.
 */
export function usuarioDeAcceso(correo: string, documento: string | null | undefined): string | null {
  if (esCorreoSena(correo)) return correo.trim().toLowerCase();
  return documento ? documento : null;
}

const SIN_USUARIO = 'Sin correo SENA la cédula es obligatoria: se usa como usuario de acceso';

/** Toda cuenta nueva necesita cédula: es su contraseña inicial y, sin correo SENA, su usuario. */
const CEDULA_REQUERIDA = 'La cédula es obligatoria: es la contraseña inicial del usuario';

/** Encabezados de Excel que se reconocen como el nombre completo (una sola columna). */
const NOMBRE_APELLIDO_COLUMNA_REGEX = /^(nombres? y apellidos?|nombre[_ ]apellido|nombre completo|full ?name)$/i;

/** Encabezados de Excel que se reconocen como la cédula. */
const DOCUMENTO_COLUMNA_REGEX = /^(c[eé]dula|documento|n[uú]mero( de)? (de )?documento|no\.? ?documento|identificaci[oó]n|cc|doc)$/i;

export interface ErrorImportacion {
  fila: number;
  usuario?: string;
  mensaje: string;
}

export interface ResultadoImportacion {
  totales: number;
  exitosos: number;
  /** Usuarios creados con la cédula como contraseña; deben cambiarla al ingresar. */
  conContrasenaTemporal: number;
  errores: ErrorImportacion[];
  /** Filas que SÍ se crearon pero con algo distinto a lo que traía el archivo (p. ej. un rol no reconocido). */
  avisos: ErrorImportacion[];
}

export interface UsuarioResponse {
  idUsuario: number;
  usuario: string;
  documento?: string | null;
  nombreApellido?: string;
  correo?: string;
  telefono?: string;
  estado: number;
  fechaCreacion: Date;
  rol: FrontendRoleKey;
}

@Injectable()
export class UsuarioService {
  private readonly logger = new Logger(UsuarioService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(Rol)
    private readonly rolRepository: Repository<Rol>,
    @InjectRepository(UsuarioRol)
    private readonly usuarioRolRepository: Repository<UsuarioRol>,
    private readonly configService: ConfigService,
  ) {}

  async create(createUsuarioDto: CreateUsuarioDto): Promise<UsuarioResponse> {
    const { rol, telefono } = createUsuarioDto;
    const nombreApellido = createUsuarioDto.nombreApellido.trim();
    const correo = createUsuarioDto.correo.trim().toLowerCase();
    const documento = this.documentoValidoOThrow(createUsuarioDto.documento);
    if (!documento) {
      throw new BadRequestException(CEDULA_REQUERIDA);
    }
    // Con cédula siempre hay usuario: el correo SENA o, si no, la propia cédula.
    const usuario = usuarioDeAcceso(correo, documento)!;

    await this.exigirIdentificadoresLibres({ usuario, correo, documento });

    const role = this.resolveRoleOrThrow(rol);

    // La contraseña no se escribe: la inicial es la cédula y la cuenta queda
    // obligada a cambiarla en el primer ingreso (como en la importación).
    const hash = await cifrarContrasena(documento, this.configService.get<number>('jwt.bcryptSalt'));

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const rolDb = await queryRunner.manager.findOne(Rol, { where: { nombre: role } });
      if (!rolDb) {
        throw new InternalServerErrorException(
          `El rol "${role}" no está configurado en la tabla roles de la base de datos`,
        );
      }

      // Lock pesimista sobre la fila con mayor idusuario: evita que dos altas concurrentes
      // calculen el mismo "siguiente id" (la tabla usuario no tiene un serial real).
      const ultimoUsuario = await queryRunner.manager
        .createQueryBuilder(Usuario, 'u')
        .setLock('pessimistic_write')
        .orderBy('u.idUsuario', 'DESC')
        .getOne();
      const nuevoId = (ultimoUsuario?.idUsuario ?? 0) + 1;

      const nuevoUsuario = queryRunner.manager.create(Usuario, {
        idUsuario: nuevoId,
        usuario,
        contrasena: hash,
        nombreApellido,
        correo,
        documento,
        telefono: telefono.trim(),
        debeCambiarContrasena: true,
        estado: 1, // 1 = activo
        fechaCreacion: new Date(),
      });
      const guardado = await queryRunner.manager.save(Usuario, nuevoUsuario);

      const ultimoUsuarioRol = await queryRunner.manager
        .createQueryBuilder(UsuarioRol, 'ur')
        .setLock('pessimistic_write')
        .orderBy('ur.id', 'DESC')
        .getOne();
      const nuevoUrId = (ultimoUsuarioRol?.id ?? 0) + 1;

      const usuarioRol = queryRunner.manager.create(UsuarioRol, {
        id: nuevoUrId,
        idUsuario: guardado.idUsuario,
        rol: rolDb,
      });
      await queryRunner.manager.save(UsuarioRol, usuarioRol);

      await queryRunner.commitTransaction();

      return this.toResponse(guardado, role);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  normalizeRoleEnum(rawRol: string | null | undefined): Role {
    if (!rawRol) return Role.CIUDADANO;
    const parsed = parseRole(rawRol);
    if (parsed) return parsed;
    const lower = rawRol.toLowerCase().trim();
    if (lower.includes('admin')) return Role.ADMINISTRADOR;
    if (lower.includes('anal')) return Role.ANALISTA;
    if (lower.includes('exper')) return Role.EXPERTO;
    if (lower.includes('ape')) return Role.APE;
    if (lower.includes('tend')) return Role.TENDENCIAS_OCUPACIONES;
    return Role.CIUDADANO;
  }

  async importBatch(usuarios: any[]): Promise<ResultadoImportacion> {
    if (!Array.isArray(usuarios) || usuarios.length === 0) {
      return { totales: 0, exitosos: 0, conContrasenaTemporal: 0, errores: [], avisos: [] };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let exitosos = 0;
    let conContrasenaTemporal = 0;
    const errores: ErrorImportacion[] = [];
    const avisos: ErrorImportacion[] = [];

    try {
      // Obtener el ID máximo inicial de usuario y de usuario_rol
      const lastUser = await queryRunner.manager.createQueryBuilder(Usuario, 'u')
        .orderBy('u.idUsuario', 'DESC')
        .getOne();
      let currentUserId = (lastUser?.idUsuario ?? 0) + 1;

      const lastUr = await queryRunner.manager.createQueryBuilder(UsuarioRol, 'ur')
        .orderBy('ur.id', 'DESC')
        .getOne();
      let currentUrId = (lastUr?.id ?? 0) + 1;

      // Precargar roles disponibles
      const allRoles = await queryRunner.manager.find(Rol);
      const rolesByName = new Map<string, Rol>();
      for (const r of allRoles) {
        rolesByName.set(r.nombre.toUpperCase(), r);
      }
      const fallbackRol = rolesByName.get(Role.CIUDADANO) || allRoles[0];

      for (let i = 0; i < usuarios.length; i++) {
        const item = usuarios[i] ?? {};
        const fila = i + 1;
        // Una sola columna en BD. Si el archivo trae Nombre y Apellido por
        // separado (plantilla anterior), se unen.
        const nombreApellido = this.texto(item.nombreApellido)
          || [this.texto(item.nombre), this.texto(item.apellido)].filter(Boolean).join(' ');
        // La columna "usuario" del archivo solo sirve de respaldo del correo: el
        // usuario de acceso lo decide usuarioDeAcceso (correo SENA o cédula).
        const correo = (this.texto(item.correo) || this.texto(item.usuario)).toLowerCase();
        // "1.193.847.562" o "1193847562 " llegan tal cual desde Excel.
        const documento = normalizarDocumento(item.documento ?? item.cedula);
        const usuarioVal = usuarioDeAcceso(correo, documento) ?? '';
        const rawRol = this.texto(item.rol) || null;

        if (!correo && !nombreApellido && !documento) {
          continue; // fila vacía
        }

        const referencia = correo || documento;
        const rechazar = (mensaje: string) => errores.push({ fila, usuario: referencia, mensaje });

        if (!correo) {
          rechazar('Fila sin correo electrónico');
          continue;
        }
        if (!isEmail(correo)) {
          rechazar(`El correo "${correo}" no es válido`);
          continue;
        }
        if (!documento) {
          rechazar(CEDULA_REQUERIDA);
          continue;
        }
        if (!CEDULA_REGEX.test(documento)) {
          rechazar(`La cédula "${documento}" no es válida: debe tener entre 5 y 12 dígitos`);
          continue;
        }

        // Verificar si ya existe en la base de datos (incluye las filas ya
        // guardadas de este mismo lote: van en la misma transacción).
        const duplicado = queryRunner.manager.createQueryBuilder(Usuario, 'u')
          .where('LOWER(u.usuario) = :usuario OR LOWER(u.correo) = :correo OR u.documento = :documento', {
            usuario: usuarioVal.toLowerCase(),
            correo,
            documento,
          });
        if (await duplicado.getOne()) {
          rechazar('El usuario, correo o cédula ya está registrado');
          continue;
        }

        // La contraseña no viene en el archivo: la inicial es la cédula y la
        // cuenta queda obligada a cambiarla en el primer ingreso.
        const hashedPassword = await cifrarContrasena(documento, this.configService.get<number>('jwt.bcryptSalt'));

        const nuevoUsuario = queryRunner.manager.create(Usuario, {
          idUsuario: currentUserId++,
          usuario: usuarioVal,
          contrasena: hashedPassword,
          nombreApellido: nombreApellido || null,
          correo,
          documento,
          debeCambiarContrasena: true,
          origen: 'EXCEL',
          estado: 1,
          fechaCreacion: new Date()
        });
        await queryRunner.manager.save(Usuario, nuevoUsuario);

        // Resolver rol
        const resolvedRoleEnum = this.normalizeRoleEnum(rawRol);
        const rolDb = rolesByName.get(resolvedRoleEnum) || fallbackRol;
        // Un rol que no es exactamente uno de los permitidos no rechaza la fila
        // (regla de siempre), pero ya no se cambia en silencio: se avisa cuál quedó.
        if (rawRol && parseRole(rawRol) !== resolvedRoleEnum) {
          avisos.push({
            fila,
            usuario: referencia,
            mensaje: `El rol "${rawRol}" no es uno de los permitidos (${Object.values(Role).join(', ')}); se asignó ${resolvedRoleEnum}.`,
          });
        }

        if (rolDb) {
          const nuevoUsuarioRol = queryRunner.manager.create(UsuarioRol, {
            id: currentUrId++,
            idUsuario: nuevoUsuario.idUsuario,
            rol: rolDb
          });
          await queryRunner.manager.save(UsuarioRol, nuevoUsuarioRol);
        }

        exitosos++;
        conContrasenaTemporal++;
      }

      await queryRunner.commitTransaction();
      return { totales: usuarios.length, exitosos, conContrasenaTemporal, errores, avisos };
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error en importBatch:', err);
      throw new InternalServerErrorException(`Error al procesar lote de usuarios: ${err.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async uploadExcel(buffer: Buffer): Promise<ResultadoImportacion> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('El archivo Excel no tiene hojas');
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
    if (rows.length === 0) {
      return { totales: 0, exitosos: 0, conContrasenaTemporal: 0, errores: [], avisos: [] };
    }

    const mapped = rows.map((row: any) => {
      const keys = Object.keys(row);
      const roleKey = keys.find(k => /^(rol|role|roles|cargo)$/i.test(k.trim()));
      const fullNameKey = keys.find(k => NOMBRE_APELLIDO_COLUMNA_REGEX.test(k.trim()));
      const nameKey = keys.find(k => /^(nombre|nombres|name|firstname)$/i.test(k.trim()));
      const lastNameKey = keys.find(k => /^(apellido|apellidos|lastname|surname)$/i.test(k.trim()));
      const emailKey = keys.find(k => /^(correo|email|mail|correo.*electr.*)$/i.test(k.trim()));
      const userKey = keys.find(k => /^(usuario|user|username)$/i.test(k.trim()));
      const docKey = keys.find(k => DOCUMENTO_COLUMNA_REGEX.test(k.trim()));

      return {
        nombreApellido: fullNameKey ? row[fullNameKey] : '',
        nombre: nameKey ? row[nameKey] : '',
        apellido: lastNameKey ? row[lastNameKey] : '',
        correo: emailKey ? row[emailKey] : (row['Correo'] || ''),
        usuario: userKey ? row[userKey] : (row['Usuario'] || (emailKey ? row[emailKey] : '')),
        documento: docKey ? row[docKey] : '',
        rol: roleKey ? row[roleKey] : ''
      };
    });

    return this.importBatch(mapped);
  }

  /** Cédula normalizada, `null` si viene vacía; 400 si no son 5 a 12 dígitos. */
  private documentoValidoOThrow(valor: string | null | undefined): string | null {
    const documento = normalizarDocumento(valor);
    if (!documento) return null;
    if (!CEDULA_REGEX.test(documento)) {
      throw new BadRequestException('La cédula debe tener entre 5 y 12 dígitos');
    }
    return documento;
  }

  /** 400 si el usuario de acceso, el correo o la cédula ya son de otra cuenta. */
  private async exigirIdentificadoresLibres(
    { usuario, correo, documento }: { usuario: string; correo: string; documento: string | null },
    exceptoId?: number,
  ): Promise<void> {
    const qb = this.usuarioRepository.createQueryBuilder('u')
      .where('(LOWER(u.usuario) = :usuario OR LOWER(u.correo) = :correo' + (documento ? ' OR u.documento = :documento)' : ')'), {
        usuario: usuario.toLowerCase(),
        correo: correo.toLowerCase(),
        documento,
      });
    if (exceptoId !== undefined) qb.andWhere('u.idUsuario != :exceptoId', { exceptoId });
    const otro = await qb.getOne();
    if (!otro) return;

    if (documento && otro.documento === documento) {
      throw new BadRequestException('La cédula ya está registrada por otro usuario');
    }
    if ((otro.correo ?? '').toLowerCase() === correo.toLowerCase()) {
      throw new BadRequestException('El correo electrónico ya está registrado por otro usuario');
    }
    throw new BadRequestException('El usuario de acceso ya está en uso por otra cuenta');
  }

  private texto(valor: unknown): string {
    return (valor ?? '').toString().trim();
  }

  async findAll(origen?: string) {
    // Buscar usuarios y traer roles para el mapeo
    const findOptions: any = {
      order: { idUsuario: 'DESC' },
    };
    if (origen) {
      findOptions.where = { origen };
    }
    const users = await this.usuarioRepository.find(findOptions);
    const userRoles = await this.usuarioRolRepository.find({ relations: ['rol'] });
    
    // Mapear los roles a los usuarios
    return users.map(user => {
      const uRole = userRoles.find(ur => ur.idUsuario === user.idUsuario);
      
      // Mapeo el nombre del rol a los keys del frontend
      let roleKey = 'citizen';
      const dbRole = uRole?.rol?.nombre?.toUpperCase();
      if (dbRole === 'ADMINISTRADOR' || dbRole === 'ADMIN') roleKey = 'admin';
      else if (dbRole === 'EXPERTO' || dbRole === 'EXPERT') roleKey = 'expert';
      else if (dbRole === 'ANALISTA') roleKey = 'analyst';
      else if (dbRole === 'APE') roleKey = 'ape';
      else if (dbRole?.includes('TENDENCIA')) roleKey = 'tendencias';

      return {
        idUsuario: user.idUsuario,
        usuario: user.usuario,
        nombreApellido: user.nombreApellido,
        correo: user.correo,
        telefono: user.telefono,
        documento: user.documento ?? null,
        debeCambiarContrasena: user.debeCambiarContrasena === true,
        estado: user.estado,
        fechaCreacion: user.fechaCreacion,
        origen: user.origen,
        rol: roleKey
      };
    });

  }

  async findOne(id: number): Promise<UsuarioResponse> {
    const user = await this.usuarioRepository.findOne({ where: { idUsuario: id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const uRole = await this.usuarioRolRepository.findOne({ where: { idUsuario: id }, relations: ['rol'] });
    const role = this.resolveRoleOrThrow(uRole?.rol?.nombre, true);

    return this.toResponse(user, role);
  }

  /** Usado por GET /usuario/me: el propio usuario autenticado consultando sus datos. */
  async findMe(idUsuario: number): Promise<UsuarioResponse> {
    return this.findOne(idUsuario);
  }

  async update(id: number, dto: UpdateUsuarioDto): Promise<UsuarioResponse> {
    const usuario = await this.usuarioRepository.findOne({ where: { idUsuario: id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (dto.nombreApellido !== undefined) {
      usuario.nombreApellido = dto.nombreApellido.trim();
    }

    // Correo y cédula determinan juntos el usuario de acceso, así que se
    // recalcula cuando cambia cualquiera de los dos.
    if (dto.correo !== undefined || dto.documento !== undefined) {
      const correo = dto.correo !== undefined && dto.correo.trim()
        ? dto.correo.trim().toLowerCase()
        : (usuario.correo ?? '');
      const documento = dto.documento !== undefined
        ? this.documentoValidoOThrow(dto.documento)
        : (usuario.documento ?? null);
      const acceso = usuarioDeAcceso(correo, documento);
      if (!acceso) {
        throw new BadRequestException(SIN_USUARIO);
      }

      await this.exigirIdentificadoresLibres({ usuario: acceso, correo, documento }, id);
      usuario.correo = correo;
      usuario.documento = documento;
      usuario.usuario = acceso;
    }

    if (dto.telefono !== undefined) {
      usuario.telefono = dto.telefono.trim();
    }

    if (dto.estado !== undefined) {
      usuario.estado = dto.estado === 'active' ? 1 : 0;
    }

    await this.usuarioRepository.save(usuario);

    if (dto.rol) {
      const role = this.resolveRoleOrThrow(dto.rol);
      const rolDb = await this.rolRepository.findOne({ where: { nombre: role } });
      if (!rolDb) {
        throw new InternalServerErrorException(
          `El rol "${role}" no está configurado en la tabla roles de la base de datos`,
        );
      }

      let usuarioRol = await this.usuarioRolRepository.findOne({ where: { idUsuario: id } });
      if (usuarioRol) {
        usuarioRol.rol = rolDb;
        await this.usuarioRolRepository.save(usuarioRol);
      } else {
        // Legado sin rol: se corrige aquí en vez de perpetuar el hueco.
        const ultimoUsuarioRol = await this.usuarioRolRepository
          .createQueryBuilder('ur')
          .orderBy('ur.id', 'DESC')
          .getOne();
        const nuevoUrId = (ultimoUsuarioRol?.id ?? 0) + 1;
        usuarioRol = this.usuarioRolRepository.create({ id: nuevoUrId, idUsuario: id, rol: rolDb });
        await this.usuarioRolRepository.save(usuarioRol);
      }
    }

    return this.findOne(id);
  }

  /**
   * Eliminación lógica: nunca se borra físicamente el registro (ni su rol asociado),
   * solo se marca estado=0. Deja al usuario reactivable sin perder el historial.
   */
  async remove(id: number): Promise<{ success: boolean; message: string }> {
    const usuario = await this.usuarioRepository.findOne({ where: { idUsuario: id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    usuario.estado = 0;
    await this.usuarioRepository.save(usuario);

    return { success: true, message: 'Usuario desactivado correctamente' };
  }

  private resolveRoleOrThrow(rawRole: string | null | undefined, isDataIntegrityCheck = false): Role {
    const role = parseRole(rawRole);
    if (!role) {
      if (isDataIntegrityCheck) {
        throw new InternalServerErrorException('El usuario no tiene un rol válido asignado');
      }
      throw new BadRequestException(
        `Rol inválido: "${rawRole}". Roles permitidos: ${Object.values(Role).join(', ')}`,
      );
    }
    return role;
  }

  private toResponse(usuario: Usuario, role: Role): UsuarioResponse {
    return {
      idUsuario: usuario.idUsuario,
      usuario: usuario.usuario,
      nombreApellido: usuario.nombreApellido,
      correo: usuario.correo,
      telefono: usuario.telefono,
      documento: usuario.documento ?? null,
      estado: usuario.estado,
      fechaCreacion: usuario.fechaCreacion,
      rol: roleToFrontendKey(role),
    };
  }
}
