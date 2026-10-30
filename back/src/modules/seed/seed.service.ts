import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { notificacionesStore } from '../shared/notificaciones.store';

/**
 * Rol + cuenta de prueba asociada.
 *
 * Convención acordada: el nombre de la persona ES el rol seguido de "Sena",
 * y el correo coincide con el identificador de login (`usuario`), para que el
 * equipo de pruebas sepa de memoria con qué cuenta está entrando.
 */
interface SemillaUsuario {
  rol: string;
  descripcionRol: string;
  usuario: string;
  /** Nombre y apellido en una sola columna (`usuario.nombre_apellido`). */
  nombreApellido: string;
  /**
   * Telefono de la cuenta de prueba. Se sigue la misma idea que el resto de la
   * convencion: valores obviamente sinteticos y correlativos (300000000N, donde
   * N es la posicion en esta lista) para que se reconozcan de inmediato como
   * datos de prueba y no se confundan con un numero real de alguien.
   */
  telefono: string;
}

const USUARIOS_SEMILLA: SemillaUsuario[] = [
  {
    rol: 'ADMINISTRADOR',
    descripcionRol: 'Administrador del sistema',
    usuario: 'admin@sena.edu.co',
    nombreApellido: 'Administrador Sena',
    telefono: '3000000001',
  },
  {
    rol: 'ANALISTA',
    descripcionRol: 'Analista Ocupacional',
    usuario: 'analista@sena.edu.co',
    nombreApellido: 'Analista Sena',
    telefono: '3000000002',
  },
  {
    rol: 'EXPERTO',
    descripcionRol: 'Experto Técnico',
    usuario: 'experto@sena.edu.co',
    nombreApellido: 'Experto Sena',
    telefono: '3000000003',
  },
  {
    rol: 'CIUDADANO',
    descripcionRol: 'Usuario Ciudadano',
    usuario: 'ciudadano@sena.edu.co',
    nombreApellido: 'Ciudadano Sena',
    telefono: '3000000004',
  },
  {
    rol: 'APE',
    descripcionRol: 'Usuario de la Agencia Pública de Empleo',
    usuario: 'ape@sena.edu.co',
    nombreApellido: 'Ape Sena',
    telefono: '3000000005',
  },
  {
    rol: 'TENDENCIAS_OCUPACIONES',
    descripcionRol: 'Usuario de Tendencias y Ocupaciones',
    usuario: 'tendencias@sena.edu.co',
    nombreApellido: 'Tendencias Ocupaciones',
    telefono: '3000000006',
  },
];

/** Clave del lock de Postgres que serializa la siembra entre réplicas. */
const SEED_LOCK_KEY = 815263401;

/**
 * Siembra las cuentas de prueba en el arranque del backend.
 *
 * Por qué aquí y no en `database/init/*.sql`: los scripts de
 * /docker-entrypoint-initdb.d SOLO se ejecutan cuando el volumen de Postgres
 * está vacío. En cuanto un entorno tiene datos —que es el caso de todos los que
 * ya están levantados— esos scripts no vuelven a correr nunca, así que no
 * sirven para garantizar que las cuentas existan. Además la imagen de
 * producción del backend solo copia `dist/`, sin `database/` ni `scripts/`.
 *
 * Semántica: CREA LO QUE FALTE, NUNCA PISA LO QUE YA EXISTE. Corre en cada
 * arranque, pero como solo inserta ausencias el efecto es el de ejecutarse una
 * sola vez. Esto es deliberado: si durante las pruebas alguien cambia su
 * contraseña o edita su perfil, un redespliegue no se lo revierte.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Inicializar persistencia de notificaciones en BD
    notificacionesStore.setDataSource(this.dataSource);
    await notificacionesStore.ensureTable();

    if (this.configService.get<string>('SEED_USUARIOS', 'true') !== 'true') {
      this.logger.log('Siembra de usuarios desactivada (SEED_USUARIOS != true)');
      return;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        // Si se levantan varias réplicas a la vez, solo una siembra; las demás
        // esperan aquí y luego encuentran las filas ya creadas. El lock es de
        // transacción, así que se libera solo al terminar.
        await manager.query('SELECT pg_advisory_xact_lock($1)', [SEED_LOCK_KEY]);

        const roles = await this.sembrarRoles(manager);
        await this.sembrarUsuarios(manager, roles);
      });
    } catch (error) {
      // La siembra es una comodidad para pruebas: si falla, se registra pero no
      // se tumba la API, que puede servir perfectamente con las cuentas que ya
      // tenga la BD.
      this.logger.error(`No se pudo completar la siembra de usuarios: ${error.message}`);
    }
  }

  /** Inserta los roles que falten y devuelve el mapa nombre -> id. */
  private async sembrarRoles(manager: EntityManager): Promise<Map<string, number>> {
    const mapa = new Map<string, number>();

    for (const { rol, descripcionRol } of USUARIOS_SEMILLA) {
      const existente = await manager.query(
        'SELECT id FROM clasificacion.roles WHERE nombre = $1 LIMIT 1',
        [rol],
      );

      if (existente.length > 0) {
        mapa.set(rol, existente[0].id);
        continue;
      }

      // `roles.id` sí tiene secuencia, pero en su día se cargó con ids
      // explícitos y quedó desincronizada (ver 003_resync_sequences). Se
      // reposiciona antes de insertar para no chocar con un id ya usado.
      await manager.query(
        `SELECT setval(
           pg_get_serial_sequence('clasificacion.roles', 'id'),
           GREATEST((SELECT COALESCE(MAX(id), 0) FROM clasificacion.roles), 1),
           true
         )`,
      );

      const [creado] = await manager.query(
        'INSERT INTO clasificacion.roles (nombre, descripcion) VALUES ($1, $2) RETURNING id',
        [rol, descripcionRol],
      );
      mapa.set(rol, creado.id);
      this.logger.log(`Rol creado: ${rol}`);
    }

    return mapa;
  }

  /** Crea las cuentas que falten y les asigna su rol. */
  private async sembrarUsuarios(
    manager: EntityManager,
    roles: Map<string, number>,
  ): Promise<void> {
    const password = this.configService.get<string>('SEED_USUARIOS_PASSWORD', 'Sena2026*');
    const saltRounds = this.configService.get<number>('jwt.bcryptSalt');

    let creados = 0;

    for (const semilla of USUARIOS_SEMILLA) {
      const idRol = roles.get(semilla.rol);
      if (!idRol) continue;

      const existente = await manager.query(
        'SELECT idusuario FROM clasificacion.usuario WHERE usuario = $1 LIMIT 1',
        [semilla.usuario],
      );

      let idUsuario: number;

      if (existente.length > 0) {
        idUsuario = existente[0].idusuario;

        // La cuenta ya existe (despliegues que vienen de antes de que `telefono`
        // existiera): se le completa el campo si esta vacio. El WHERE exige que
        // sea NULL o cadena vacia a proposito, para no pisar nunca un numero que
        // alguien haya escrito de verdad — la siembra solo rellena huecos.
        await manager.query(
          `UPDATE clasificacion.usuario
              SET telefono = $2
            WHERE idusuario = $1
              AND (telefono IS NULL OR telefono = '')`,
          [idUsuario, semilla.telefono],
        );
      } else {
        // `usuario.idusuario` es PrimaryColumn sin secuencia (lo asigna la
        // aplicación, igual que hace UsuarioService), así que se calcula aquí.
        const [{ siguiente }] = await manager.query(
          'SELECT COALESCE(MAX(idusuario), 0) + 1 AS siguiente FROM clasificacion.usuario',
        );

        // El hash se genera con el mismo bcryptjs y el mismo coste que usa
        // AuthService, en vez de dejarlo escrito a mano en un .sql: así la
        // contraseña sembrada siempre valida contra el login real.
        const hash = await bcrypt.hash(password, await bcrypt.genSalt(saltRounds));

        await manager.query(
          `INSERT INTO clasificacion.usuario
             (idusuario, usuario, "contraseña", nombre_apellido, correo, telefono, origen, estado, fecha_creacion)
           VALUES ($1, $2, $3, $4, $2, $5, 'SEED', 1, CURRENT_DATE)`,
          [siguiente, semilla.usuario, hash, semilla.nombreApellido, semilla.telefono],
        );

        idUsuario = siguiente;
        creados++;
        this.logger.log(`Usuario creado: ${semilla.usuario} (${semilla.rol})`);
      }

      await this.asignarRol(manager, idUsuario, idRol);
    }

    this.logger.log(
      creados === 0
        ? 'Cuentas de prueba ya presentes — no se creó ninguna'
        : `Siembra completada: ${creados} cuenta(s) de prueba creada(s)`,
    );
  }

  /** Asigna el rol solo si la cuenta aún no tiene ninguno. */
  private async asignarRol(
    manager: EntityManager,
    idUsuario: number,
    idRol: number,
  ): Promise<void> {
    const asignado = await manager.query(
      'SELECT id FROM clasificacion.usuario_roles WHERE idusuario = $1 LIMIT 1',
      [idUsuario],
    );
    if (asignado.length > 0) return;

    // `usuario_roles.id` tampoco tiene secuencia asociada.
    const [{ siguiente }] = await manager.query(
      'SELECT COALESCE(MAX(id), 0) + 1 AS siguiente FROM clasificacion.usuario_roles',
    );

    await manager.query(
      'INSERT INTO clasificacion.usuario_roles (id, idusuario, id_roles) VALUES ($1, $2, $3)',
      [siguiente, idUsuario, idRol],
    );
  }
}
