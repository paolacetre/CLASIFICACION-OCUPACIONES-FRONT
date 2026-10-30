import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';

import { Instrumento } from '../instrumento2/entities/instrumento.entity';
import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { Respuesta } from '../encuesta/entities/respuesta.entity';
import { PreguntaRespuesta } from '../encuesta/entities/pregunta-respuesta.entity';
import { rondaVigente } from '../encuesta/rondas-snapshot';
import { Usuario } from '../usuario/entities/usuario.entity';
import { UsuarioRol } from '../auth/entities/usuario-rol.entity';
import { Role } from '../../common/enums/role.enum';
import { codigoRealDeCopia, ocupacionDeItem } from '../instrumento2/ocupaciones-de-instrumento';
import { notificacionesStore } from '../shared/notificaciones.store';
import { InstrumentoExperto } from './entities/instrumento-experto.entity';
import { expertoDeUsuario } from './experto-de-usuario';
import {
  AvanceValidacionDto,
  DatosGeneralesDto,
  EstadoCampoValidacion,
  EstadoValidacion,
  ExpertoResumenDto,
  GuardarValidacionExpertaDto,
  InfoOcupacionAjusteConCodigoDto,
  ValidacionExpertaDto,
} from './dto/validacion-experta.dto';
import { camposDeSnapshot, camposValidablesDeSnapshot, claveCampo } from './campos-validables';

/** Datos del informante que el cierre exige, con el nombre que ve el experto. */
const DATOS_INFORMANTE_OBLIGATORIOS: Array<[keyof DatosGeneralesDto, string]> = [
  ['nombreApellidos', 'Nombre y apellidos'],
  ['email', 'Correo electrónico'],
  ['telefono', 'Teléfono de contacto'],
  ['departamento', 'Departamento'],
  ['municipio', 'Municipio'],
  ['empresaEntidad', 'Empresa o entidad'],
  ['cargo', 'Cargo'],
  ['profesion', 'Profesión'],
];

/** Ítems del snapshot donde el experto puede proponer otro texto. */
const PROPUESTAS: Array<[keyof InfoOcupacionAjusteConCodigoDto, string]> = [
  ['descripcion', 'descripcion'],
  ['areaDesempeno', 'area_desempeno'],
];

const ESTADO_ENVIADO = 'ENVIADO_EXPERTO';
const BORRADOR: EstadoValidacion = 'en_revision';

/** Experto que responde, tal como llega del token. */
export interface ExpertoEnSesion {
  idUsuario: number;
  correo: string;
  rol?: Role | string;
}

/**
 * Validación experta de CUALQUIER instrumento (I2 o I3), sobre las tablas
 * `respuestas` (una por experto, instrumento y ronda) y `pregunta_respuesta`
 * (un veredicto por ítem del snapshot `pregunta`).
 *
 * Varios expertos validan el mismo instrumento: los elige quien lo envía
 * (`instrumento_experto`). Ninguno ve lo de los demás. El instrumento se
 * cierra solo cuando todos los asignados cierran su validación, o cuando lo
 * cierra el analista o el administrador.
 */
@Injectable()
export class ValidacionExpertaService {
  private readonly logger = new Logger(ValidacionExpertaService.name);

  constructor(
    @InjectRepository(Instrumento)
    private readonly instrumentoRepo: Repository<Instrumento>,

    private readonly dataSource: DataSource,
  ) {}

  // ─── Consulta ──────────────────────────────────────────────────────────────

  /** La validación del experto en sesión en la ronda vigente, o null si aún no guardó. */
  async getValidacion(
    instrumentoId: number,
    experto: ExpertoEnSesion,
    tipo?: string,
  ): Promise<ValidacionExpertaDto | null> {
    const manager = this.instrumentoRepo.manager;
    const row = await this.findInstrumentoOrThrow(manager, instrumentoId, tipo);
    const ronda = await rondaVigente(manager, instrumentoId);

    const respuesta = await this.findRespuesta(manager, instrumentoId, experto.idUsuario, ronda);
    return respuesta ? this.toDto(manager, row, respuesta) : null;
  }

  /** Expertos asignados en la ronda vigente y en qué va cada uno. */
  async getAvance(instrumentoId: number, tipo?: string): Promise<AvanceValidacionDto> {
    const manager = this.instrumentoRepo.manager;
    const row = await this.findInstrumentoOrThrow(manager, instrumentoId, tipo);
    return this.avanceCon(manager, row);
  }

  /** Usuarios activos con rol EXPERTO, para elegir a quién se envía. */
  async listarExpertosDisponibles(): Promise<ExpertoResumenDto[]> {
    const usuarios = await this.consultaExpertosActivos(this.instrumentoRepo.manager)
      .orderBy('u.nombreApellido', 'ASC')
      .getMany();
    return usuarios.map((usuario) => this.toExperto(usuario));
  }

  // ─── Asignación ────────────────────────────────────────────────────────────

  /**
   * Fija los expertos de una ronda. Se llama al enviar a experto, dentro de
   * su transacción. Reemplaza la asignación previa de esa misma ronda: si
   * existe, es porque se envió y se cerró sin que nadie respondiera.
   */
  async asignarExpertos(
    manager: EntityManager,
    row: Instrumento,
    ronda: number,
    idsExpertos: number[],
    asignadoPor?: number | null,
  ): Promise<void> {
    const validos = await this.consultaExpertosActivos(manager)
      .andWhere('u.idUsuario IN (:...ids)', { ids: idsExpertos })
      .getMany();
    const idsValidos = new Set(validos.map((usuario) => usuario.idUsuario));
    const invalidos = idsExpertos.filter((id) => !idsValidos.has(id));
    if (invalidos.length > 0) {
      throw new BadRequestException(
        `Estos usuarios no son expertos activos: ${invalidos.join(', ')}.`,
      );
    }

    await manager.delete(InstrumentoExperto, {
      instrumento: { idInstrumento: row.idInstrumento },
      ronda,
    });
    await manager.insert(
      InstrumentoExperto,
      idsExpertos.map((idUsuario) => ({
        instrumento: { idInstrumento: row.idInstrumento } as Instrumento,
        usuario: { idUsuario } as Usuario,
        asignadoPor: asignadoPor ? ({ idUsuario: asignadoPor } as Usuario) : null,
        ronda,
        fechaAsignacion: new Date(),
      })),
    );
  }

  /** Avisa a cada experto asignado. Fuera de la transacción: no debe tumbarla. */
  notificarAsignacion(row: Instrumento, idsExpertos: number[], nombreOcupacion: string): void {
    const etiqueta = row.tipo === 'instrumento3' ? 'Instrumento 3' : 'Instrumento 2';
    for (const idUsuario of idsExpertos) {
      try {
        notificacionesStore.agregar({
          rolDestino: 'EXPERTO',
          idUsuario,
          titulo: `Nuevo ${etiqueta} pendiente de revisión`,
          mensaje: `Te asignaron el ${etiqueta} (${nombreOcupacion}) para su validación experta.`,
          tipoEvento: row.tipo === 'instrumento3' ? 'INSTRUMENTO3_ENVIADO' : 'INSTRUMENTO2_ENVIADO',
          idInstrumento: row.idInstrumento,
          ruta: '/validacion-experta',
        });
      } catch (error) {
        this.logger.warn(`No se pudo notificar al experto ${idUsuario}: ${(error as Error).message}`);
      }
    }
  }

  /** Ids de instrumentos que un experto puede ver: asignados a él o sin asignación (históricos). */
  async instrumentosVisiblesParaExperto(
    manager: EntityManager,
    idUsuario: number,
    ids: number[],
  ): Promise<Set<number>> {
    if (ids.length === 0) return new Set();
    const asignaciones = await manager.find(InstrumentoExperto, {
      where: { instrumento: { idInstrumento: In(ids) } },
      loadRelationIds: { relations: ['instrumento', 'usuario'] },
    });

    const conAsignacion = new Set<number>();
    const propios = new Set<number>();
    for (const asignacion of asignaciones) {
      const instrumento = asignacion.instrumento as unknown as number;
      conAsignacion.add(instrumento);
      if ((asignacion.usuario as unknown as number) === idUsuario) propios.add(instrumento);
    }
    return new Set(ids.filter((id) => propios.has(id) || !conAsignacion.has(id)));
  }

  // ─── Guardado ──────────────────────────────────────────────────────────────

  /**
   * Guarda (upsert) la validación del experto en la ronda vigente.
   *
   * Solo mientras el instrumento está enviado a experto. Revalidar reemplaza
   * lo que ESE experto había guardado; nunca toca lo de los demás.
   *
   * `externo` permite correr dentro de la transacción de quien llama
   * (Instrumento 2 completa antes, en la misma, el snapshot de instrumentos
   * antiguos); sin él se abre una propia.
   */
  async guardar(
    instrumentoId: number,
    dto: GuardarValidacionExpertaDto,
    experto: ExpertoEnSesion,
    tipo?: string,
    externo?: EntityManager,
  ): Promise<ValidacionExpertaDto> {
    if (externo) return this.guardarCon(externo, instrumentoId, dto, experto, tipo);
    return this.dataSource.transaction((manager) =>
      this.guardarCon(manager, instrumentoId, dto, experto, tipo),
    );
  }

  private async guardarCon(
    manager: EntityManager,
    instrumentoId: number,
    dto: GuardarValidacionExpertaDto,
    experto: ExpertoEnSesion,
    tipo: string | undefined,
  ): Promise<ValidacionExpertaDto> {
    const row = await this.findInstrumentoOrThrow(manager, instrumentoId, tipo);

    // Validar algo que el analista todavía edita dejaría un veredicto sobre
    // datos que pueden cambiar; y uno ya cerrado no admite más respuestas.
    if (row.estado !== ESTADO_ENVIADO) {
      throw new ConflictException(
        `El instrumento no está abierto a validación (estado actual: ${row.estado ?? 'sin estado'}).`,
      );
    }

    const ronda = await rondaVigente(manager, instrumentoId);
    const asignados = await this.asignadosDeRonda(manager, instrumentoId, ronda);
    const esAdministrador = String(experto.rol ?? '').toUpperCase() === Role.ADMINISTRADOR;
    if (asignados.length > 0 && !esAdministrador && !asignados.includes(experto.idUsuario)) {
      throw new ForbiddenException('No estás asignado como experto de este instrumento.');
    }

    const cierra = dto.estado !== BORRADOR;
    // Un avance parcial puede no traer campos todavía; cerrar sin ninguno
    // sería un error, y no debe depender solo del frontend.
    if (cierra && dto.campos.length === 0) {
      throw new BadRequestException(
        'Para cerrar la validación se requiere al menos un campo calificado.',
      );
    }

    const preguntas = await this.preguntasDeRonda(manager, instrumentoId, ronda);
    const ocupacionDe = (pregunta: Pregunta) => ocupacionDeItem(pregunta.codOcupacion, row);
    const preguntaPorCampo = new Map(
      camposDeSnapshot(preguntas, ocupacionDe).map((c) => [claveCampo(c.codOcupacion, c.campo), c.item]),
    );

    // Instrumento 3 conserva su contrato: su formulario no sale del snapshot
    // multi-ocupación.
    if (cierra && row.tipo === 'instrumento2') {
      this.assertCierreCompleto(row, dto, preguntas);
    }

    // Cada veredicto se enlaza a SU fila de `pregunta`. Un campo que no está
    // en el snapshot no tiene a qué apuntar: mejor rechazarlo que perderlo.
    const filas = new Map<number, Partial<PreguntaRespuesta>>();
    const desconocidos: string[] = [];
    for (const campo of dto.campos) {
      const pregunta = preguntaPorCampo.get(claveCampo(ocupacionDeItem(campo.codOcupacion, row), campo.campo));
      if (!pregunta) {
        desconocidos.push(campo.campo);
        continue;
      }
      filas.set(pregunta.idPregunta, {
        respuesta: campo.estado,
        otro: campo.comentario?.trim() || null,
        valorPropuesto: null,
      });
    }
    if (desconocidos.length > 0) {
      throw new BadRequestException(
        `Estos campos no están en el instrumento enviado: ${desconocidos.slice(0, 5).join(', ')}.`,
      );
    }

    for (const propuesta of this.propuestasDe(dto, row)) {
      const pregunta = preguntaPorCampo.get(claveCampo(propuesta.codOcupacion, propuesta.identificador));
      if (!pregunta) {
        // Snapshots anteriores a la 029 omitían el ítem si estaba vacío.
        this.logger.warn(
          `Instrumento ${instrumentoId}: la ocupación ${propuesta.codOcupacion} no tiene «${propuesta.identificador}» en el snapshot; no se guarda la propuesta.`,
        );
        continue;
      }
      if (propuesta.texto === (pregunta.detalle ?? '').trim()) continue;
      const fila = filas.get(pregunta.idPregunta) ?? { respuesta: null, otro: null };
      filas.set(pregunta.idPregunta, { ...fila, valorPropuesto: propuesta.texto });
    }

    const existente = await this.findRespuesta(manager, instrumentoId, experto.idUsuario, ronda);
    if (existente) {
      await manager.delete(PreguntaRespuesta, { cabecera: { idRespuesta: existente.idRespuesta } });
    }

    const cabecera = await manager.save(
      Respuesta,
      manager.create(Respuesta, {
        idRespuesta: existente?.idRespuesta,
        instrumento: { idInstrumento: instrumentoId } as Instrumento,
        usuario: { idUsuario: experto.idUsuario } as Usuario,
        ronda,
        estado: dto.estado,
        observaciones: dto.observaciones?.trim() || null,
        fechaValidacion: new Date(),
        ...this.toColumnasInformante(dto.datosGenerales),
      }),
    );

    if (filas.size > 0) {
      await manager.insert(
        PreguntaRespuesta,
        [...filas.entries()].map(([idPregunta, fila]) => ({
          ...fila,
          cabecera: { idRespuesta: cabecera.idRespuesta } as Respuesta,
          pregunta: { idPregunta } as Pregunta,
          usuario: { idUsuario: experto.idUsuario } as Usuario,
        })),
      );
    }

    if (cierra) {
      await this.cerrarSiTodosRespondieron(manager, row, ronda, asignados);
    }

    this.logger.log(
      `Validación de experto ${experto.idUsuario} sobre instrumento ${instrumentoId} (ronda ${ronda}): ${dto.estado} (${filas.size} ítems)`,
    );

    const guardada = await this.findRespuesta(manager, instrumentoId, experto.idUsuario, ronda);
    return this.toDto(manager, row, guardada!);
  }

  // ─── Cierre ────────────────────────────────────────────────────────────────

  /**
   * Cierre manual por el analista o el administrador, aunque falten expertos
   * por responder. Se consolida con las validaciones ya cerradas; los
   * borradores de quien no terminó no cuentan.
   */
  async cerrarValidacion(instrumentoId: number, tipo?: string): Promise<AvanceValidacionDto> {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.findInstrumentoOrThrow(manager, instrumentoId, tipo);
      if (row.estado !== ESTADO_ENVIADO) {
        throw new ConflictException(
          `Solo se cierra un instrumento enviado a experto (estado actual: ${row.estado ?? 'sin estado'}).`,
        );
      }

      const ronda = await rondaVigente(manager, instrumentoId);
      const cerradas = await this.estadosCerrados(manager, instrumentoId, ronda);
      if (cerradas.length === 0) {
        throw new ConflictException(
          'Ningún experto ha cerrado su validación todavía: no hay veredicto con el que cerrar.',
        );
      }

      await this.cerrar(manager, row, cerradas);
      return this.avanceCon(manager, { ...row, estado: this.estadoConsolidado(cerradas) } as Instrumento);
    });
  }

  /**
   * Con asignados: se cierra cuando todos cerraron su validación. Sin
   * asignados (instrumentos anteriores a la asignación, e Instrumento 3) se
   * conserva el comportamiento de antes: el primer veredicto final cierra.
   */
  private async cerrarSiTodosRespondieron(
    manager: EntityManager,
    row: Instrumento,
    ronda: number,
    asignados: number[],
  ): Promise<void> {
    const respuestas = await manager.find(Respuesta, {
      where: { instrumento: { idInstrumento: row.idInstrumento }, ronda, estado: Not(BORRADOR) },
      loadRelationIds: { relations: ['usuario'] },
    });
    const quienesCerraron = new Set(respuestas.map((r) => r.usuario as unknown as number));
    if (asignados.length > 0 && !asignados.every((id) => quienesCerraron.has(id))) return;

    await this.cerrar(manager, row, respuestas.map((r) => r.estado as EstadoValidacion));
  }

  private async cerrar(manager: EntityManager, row: Instrumento, estados: EstadoValidacion[]): Promise<void> {
    const estado = this.estadoConsolidado(estados);
    await manager.update(Instrumento, { idInstrumento: row.idInstrumento }, { estado });
    this.logger.log(`Instrumento ${row.idInstrumento} cerrado: ${estado} (${estados.length} validaciones)`);

    try {
      notificacionesStore.agregar({
        rolDestino: 'ANALISTA',
        idUsuario: row.usuario?.idUsuario ?? null,
        titulo: 'Validación experta cerrada',
        mensaje: `El instrumento #${row.idInstrumento} terminó su validación experta: ${estado.replace(/_/g, ' ').toLowerCase()}.`,
        tipoEvento: 'VALIDACION_EXPERTA_COMPLETADA',
        idInstrumento: row.idInstrumento,
        ruta: row.tipo === 'instrumento3' ? '/instrumento3' : '/instrumento2',
      });
    } catch (error) {
      this.logger.warn(`No se pudo notificar el cierre del instrumento ${row.idInstrumento}: ${(error as Error).message}`);
    }
  }

  /**
   * Estado del instrumento a partir de las validaciones cerradas: si alguien
   * pidió ajustes, ajustes; si todos aprobaron, aprobado; si no (hubo algún
   * rechazo), validado.
   */
  estadoConsolidado(estados: EstadoValidacion[]): string {
    if (estados.includes('ajustes_solicitados')) return 'AJUSTES_SOLICITADOS';
    if (estados.length > 0 && estados.every((estado) => estado === 'aprobada')) return 'APROBADO_FINAL';
    return 'VALIDADO';
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async findInstrumentoOrThrow(
    manager: EntityManager,
    id: number,
    tipo?: string,
  ): Promise<Instrumento> {
    const row = await manager.findOne(Instrumento, {
      where: tipo ? { idInstrumento: id, tipo } : { idInstrumento: id },
      // La comparativa da el sufijo exacto de las copias, para nombrar la
      // ocupación con su código real en los mensajes de validación.
      relations: ['comparativaOcupacion', 'usuario'],
    });
    if (!row) throw new NotFoundException(`Instrumento ${id} no encontrado.`);
    return row;
  }

  private findRespuesta(
    manager: EntityManager,
    instrumentoId: number,
    idUsuario: number,
    ronda: number,
  ): Promise<Respuesta | null> {
    return manager.findOne(Respuesta, {
      where: { instrumento: { idInstrumento: instrumentoId }, usuario: { idUsuario }, ronda },
      relations: ['usuario', 'preguntaRespuestas', 'preguntaRespuestas.pregunta'],
    });
  }

  private preguntasDeRonda(manager: EntityManager, instrumentoId: number, ronda: number): Promise<Pregunta[]> {
    return manager.find(Pregunta, {
      where: { instrumento: { idInstrumento: instrumentoId }, ronda },
      order: { idPregunta: 'ASC' },
    });
  }

  private async asignadosDeRonda(manager: EntityManager, instrumentoId: number, ronda: number): Promise<number[]> {
    const asignaciones = await manager.find(InstrumentoExperto, {
      where: { instrumento: { idInstrumento: instrumentoId }, ronda },
      loadRelationIds: { relations: ['usuario'] },
    });
    return asignaciones.map((a) => a.usuario as unknown as number);
  }

  private async estadosCerrados(manager: EntityManager, instrumentoId: number, ronda: number): Promise<EstadoValidacion[]> {
    const respuestas = await manager.find(Respuesta, {
      where: { instrumento: { idInstrumento: instrumentoId }, ronda, estado: Not(BORRADOR) },
      select: { idRespuesta: true, estado: true },
    });
    return respuestas.map((r) => r.estado as EstadoValidacion);
  }

  private consultaExpertosActivos(manager: EntityManager) {
    return manager
      .createQueryBuilder(Usuario, 'u')
      .innerJoin(UsuarioRol, 'ur', 'ur.idUsuario = u.idUsuario')
      .innerJoin('ur.rol', 'r')
      .where('UPPER(r.nombre) = :rol', { rol: Role.EXPERTO })
      .andWhere('u.estado = 1')
      .distinct(true);
  }

  private async avanceCon(manager: EntityManager, row: Instrumento): Promise<AvanceValidacionDto> {
    const ronda = await rondaVigente(manager, row.idInstrumento);
    // En serie, no con Promise.all: desde `cerrarValidacion` el manager es el de
    // una transacción (una sola conexión), y dos consultas a la vez sobre el
    // mismo cliente disparan el DeprecationWarning de pg (será error en pg@9).
    const asignaciones = await manager.find(InstrumentoExperto, {
      where: { instrumento: { idInstrumento: row.idInstrumento }, ronda },
      relations: ['usuario'],
      order: { id: 'ASC' },
    });
    const respuestas = await manager.find(Respuesta, {
      where: { instrumento: { idInstrumento: row.idInstrumento }, ronda },
      relations: ['usuario'],
    });

    const respuestaDe = new Map(respuestas.map((r) => [r.usuario.idUsuario, r]));
    // Los asignados primero; después quien respondió sin estar asignado
    // (el administrador puede responder cualquier instrumento).
    const usuarios = [
      ...asignaciones.map((a) => a.usuario),
      ...respuestas.map((r) => r.usuario).filter((u) => !asignaciones.some((a) => a.usuario.idUsuario === u.idUsuario)),
    ];

    const expertos = usuarios.map((usuario) => {
      const respuesta = respuestaDe.get(usuario.idUsuario);
      return {
        ...this.toExperto(usuario),
        estado: (respuesta?.estado as EstadoValidacion) ?? null,
        fechaValidacion: respuesta ? this.fechaAIso(respuesta.fechaValidacion) : null,
      };
    });

    return {
      ronda,
      estadoInstrumento: row.estado ?? '',
      expertos,
      asignados: asignaciones.length,
      cerrados: asignaciones.filter((a) => {
        const estado = respuestaDe.get(a.usuario.idUsuario)?.estado;
        return !!estado && estado !== BORRADOR;
      }).length,
    };
  }

  /** Propuestas de descripción y área que trae el guardado, por ocupación. */
  private propuestasDe(
    dto: GuardarValidacionExpertaDto,
    row: Instrumento,
  ): Array<{ codOcupacion: string; identificador: string; texto: string }> {
    const principal = ocupacionDeItem(null, row);
    const ajustes =
      dto.infoOcupaciones && dto.infoOcupaciones.length > 0
        ? dto.infoOcupaciones
        : dto.infoOcupacion
          ? [{ ...dto.infoOcupacion, codOcupacion: principal }]
          : [];

    return ajustes.flatMap((info) =>
      PROPUESTAS.flatMap(([propiedad, identificador]) => {
        const texto = String(info[propiedad] ?? '').trim();
        if (!texto) return [];
        return [{ codOcupacion: info.codOcupacion?.trim() || principal, identificador, texto }];
      }),
    );
  }

  /**
   * Un veredicto final tiene que estar completo, y eso no puede depender solo
   * del frontend: cualquier cliente de la API podría cerrar una agrupación de
   * tres ocupaciones calificando una sola.
   *
   * Exige: todos los campos calificables del snapshot de TODAS las
   * ocupaciones, el comentario en "propuesta de mejora" (el único caso en
   * que es obligatorio) y los datos del informante. Las observaciones
   * generales son opcionales.
   */
  private assertCierreCompleto(
    row: Instrumento,
    dto: GuardarValidacionExpertaDto,
    preguntas: Pregunta[],
  ): void {
    const faltantes: string[] = [];
    const nombreOcupacion = (codigo: string) =>
      codigoRealDeCopia(codigo, row.comparativaOcupacion?.codigo) || codigo;
    const conTexto = (valor?: string | null) => (valor ?? '').trim().length > 0;

    const esperados = camposValidablesDeSnapshot(preguntas, (p) => ocupacionDeItem(p.codOcupacion, row));
    const recibidos = new Set(
      dto.campos.map((campo) => claveCampo(ocupacionDeItem(campo.codOcupacion, row), campo.campo)),
    );

    const pendientesPorOcupacion = new Map<string, number>();
    for (const esperado of esperados) {
      if (!recibidos.has(claveCampo(esperado.codOcupacion, esperado.campo))) {
        pendientesPorOcupacion.set(
          esperado.codOcupacion,
          (pendientesPorOcupacion.get(esperado.codOcupacion) ?? 0) + 1,
        );
      }
    }
    for (const [codigo, cantidad] of pendientesPorOcupacion) {
      faltantes.push(
        `la ocupación ${nombreOcupacion(codigo)} tiene ${cantidad} criterio(s) sin calificar`,
      );
    }

    for (const campo of dto.campos) {
      // El comentario solo es obligatorio en "Con propuesta de mejora".
      if (campo.estado === 'propuesta_mejora' && !conTexto(campo.comentario)) {
        const donde = `«${campo.campo}» (ocupación ${nombreOcupacion(ocupacionDeItem(campo.codOcupacion, row))})`;
        faltantes.push(`${donde} está en "Con propuesta de mejora" sin comentario`);
      }
    }

    for (const [clave, etiqueta] of DATOS_INFORMANTE_OBLIGATORIOS) {
      if (!conTexto(dto.datosGenerales?.[clave])) {
        faltantes.push(`falta el dato del informante «${etiqueta}»`);
      }
    }

    if (faltantes.length > 0) {
      throw new BadRequestException(
        `La validación no se puede cerrar: ${faltantes.slice(0, 5).join('; ')}` +
          (faltantes.length > 5 ? ` (y ${faltantes.length - 5} más).` : '.'),
      );
    }
  }

  private async toDto(
    manager: EntityManager,
    row: Instrumento,
    respuesta: Respuesta,
  ): Promise<ValidacionExpertaDto> {
    // El nombre de campo ("funcion_2") depende de la posición del ítem en SU
    // ronda, así que se recalcula sobre ese snapshot.
    const preguntas = await this.preguntasDeRonda(manager, row.idInstrumento, respuesta.ronda);
    const campoDe = new Map(
      camposDeSnapshot(preguntas, (p) => ocupacionDeItem(p.codOcupacion, row)).map((c) => [
        c.item.idPregunta,
        c,
      ]),
    );

    const conteos: Record<EstadoCampoValidacion, number> = {
      aplica: 0,
      no_aplica: 0,
      requiere_ajuste: 0,
      propuesta_mejora: 0,
    };
    const propuestas = new Map<string, InfoOcupacionAjusteConCodigoDto>();
    const campos: ValidacionExpertaDto['campos'] = [];

    for (const fila of respuesta.preguntaRespuestas ?? []) {
      const campo = campoDe.get(fila.pregunta.idPregunta);
      if (!campo) continue;

      if (fila.valorPropuesto) {
        const propiedad = PROPUESTAS.find(([, identificador]) => identificador === campo.identificador)?.[0];
        if (propiedad) {
          const info = propuestas.get(campo.codOcupacion) ?? { codOcupacion: campo.codOcupacion };
          propuestas.set(campo.codOcupacion, { ...info, [propiedad]: fila.valorPropuesto });
        }
      }

      if (!fila.respuesta) continue;
      if (fila.respuesta in conteos) conteos[fila.respuesta as EstadoCampoValidacion] += 1;
      campos.push({
        id: fila.id,
        campo: campo.campo,
        estado: fila.respuesta as EstadoCampoValidacion,
        comentario: fila.otro ?? undefined,
        codOcupacion: campo.codOcupacion || undefined,
        valorOriginal: fila.pregunta.detalle ?? undefined,
      });
    }

    return {
      id: respuesta.idRespuesta,
      instrumentoId: row.idInstrumento,
      ronda: respuesta.ronda,
      estado: respuesta.estado as EstadoValidacion,
      experto: this.toExperto(respuesta.usuario),
      observaciones: respuesta.observaciones,
      fechaValidacion: this.fechaAIso(respuesta.fechaValidacion) ?? '',
      campos,
      conteos,
      infoOcupaciones: [...propuestas.values()],
      datosGenerales: {
        nombreApellidos: respuesta.nombreApellido ?? undefined,
        email: respuesta.email ?? undefined,
        telefono: respuesta.telefono ?? undefined,
        departamento: respuesta.departamento ?? undefined,
        municipio: respuesta.municipio ?? undefined,
        empresaEntidad: respuesta.empresaEntidad ?? undefined,
        cargo: respuesta.cargo ?? undefined,
        profesion: respuesta.profesion ?? undefined,
      },
    };
  }

  private toExperto(usuario: Usuario): ExpertoResumenDto {
    return expertoDeUsuario(usuario);
  }

  /** Aplana los datos del informante a las columnas de `respuestas`. */
  private toColumnasInformante(datos?: DatosGeneralesDto): Partial<Respuesta> {
    const limpio = (valor?: string) => valor?.trim() || null;
    return {
      nombreApellido: limpio(datos?.nombreApellidos),
      email: limpio(datos?.email),
      telefono: limpio(datos?.telefono),
      departamento: limpio(datos?.departamento),
      municipio: limpio(datos?.municipio),
      empresaEntidad: limpio(datos?.empresaEntidad),
      cargo: limpio(datos?.cargo),
      profesion: limpio(datos?.profesion),
    };
  }

  private fechaAIso(valor: Date | string | null | undefined): string | null {
    if (!valor) return null;
    if (typeof valor === 'string') return valor;
    return valor.toISOString();
  }
}
