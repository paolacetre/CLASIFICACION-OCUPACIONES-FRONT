import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { Instrumento } from '../instrumento2/entities/instrumento.entity';
import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { Respuesta } from '../encuesta/entities/respuesta.entity';
import { prepararRondaParaEscribir, soloRondaVigente } from '../encuesta/rondas-snapshot';
import { Usuario } from '../usuario/entities/usuario.entity';
import { PreguntaSnapshotDto } from '../instrumento2/dto/pregunta-snapshot.dto';
import { Instrumento3Propuesta } from './entities/instrumento3-propuesta.entity';
import { Instrumento3Estado, TIPO_INSTRUMENTO3 } from './enums/instrumento3-estado.enum';
import {
  CreateInstrumento3Dto,
  Instrumento3DetailDto,
  UpdateInstrumento3Dto,
} from './dto/instrumento3.dto';
import { notificacionesStore } from '../shared/notificaciones.store';

/**
 * Identificadores de `pregunta` que corresponden a listas del formulario.
 * Se comparten con Instrumento 2 para que Validación Experta no tenga que
 * distinguir el origen del instrumento.
 */
const LISTAS: ReadonlyArray<{ campo: keyof CreateInstrumento3Dto; identificador: string }> = [
  { campo: 'funciones', identificador: 'funcion' },
  { campo: 'denominaciones', identificador: 'denominacion' },
  { campo: 'habilidades', identificador: 'habilidad' },
  { campo: 'conocimientos', identificador: 'conocimiento' },
  { campo: 'ocupacionesRelacionadas', identificador: 'relacionada' },
];

/**
 * CRUD + flujo de estados de Instrumento 3 (propuesta de nuevos perfiles).
 *
 * Reparto de almacenamiento, en el mismo patrón que Instrumento 2:
 *   · `instrumento`            → cabecera (tipo='instrumento3')
 *   · `instrumento3_propuesta` → campos escalares
 *   · `pregunta`               → listas sin tope + snapshot para el experto
 *
 * El veredicto del experto no se maneja aquí: vive en `validacion_experta`,
 * que apunta a `instrumento` y por tanto sirve a I2 e I3 por igual.
 */
@Injectable()
export class Instrumento3Service {
  private readonly logger = new Logger(Instrumento3Service.name);

  constructor(
    @InjectRepository(Instrumento)
    private readonly instrumentoRepo: Repository<Instrumento>,

    @InjectRepository(Instrumento3Propuesta)
    private readonly propuestaRepo: Repository<Instrumento3Propuesta>,

    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<Instrumento3DetailDto[]> {
    const rows = await this.instrumentoRepo.find({
      where: { tipo: TIPO_INSTRUMENTO3 },
      relations: ['usuario'],
      order: { idInstrumento: 'DESC' },
    });
    if (rows.length === 0) return [];

    const manager = this.instrumentoRepo.manager;
    const ids = rows.map((row) => row.idInstrumento);

    // Dos consultas en lote (propuestas y preguntas) en vez de dos por fila
    const propuestas = await manager.find(Instrumento3Propuesta, {
      where: { instrumento: { idInstrumento: In(ids) } },
      loadRelationIds: { relations: ['instrumento'] },
    });
    const propuestaPorInstrumento = new Map<number, Instrumento3Propuesta>();
    for (const propuesta of propuestas) {
      propuestaPorInstrumento.set(propuesta.instrumento as unknown as number, propuesta);
    }

    const preguntas = await this.cargarPreguntasEnLote(manager, ids);

    return rows.map((row) =>
      this.toDto(row, propuestaPorInstrumento.get(row.idInstrumento), preguntas.get(row.idInstrumento) ?? []),
    );
  }

  async findById(id: number): Promise<Instrumento3DetailDto> {
    const manager = this.instrumentoRepo.manager;
    const row = await this.findInstrumentoOrThrow(manager, id);
    const propuesta = await this.findPropuesta(manager, id);
    const preguntas = (await this.cargarPreguntasEnLote(manager, [id])).get(id) ?? [];
    return this.toDto(row, propuesta, preguntas);
  }

  /** Crea la propuesta en estado BORRADOR. */
  async create(dto: CreateInstrumento3Dto, idUsuario?: number): Promise<Instrumento3DetailDto> {
    const id = await this.dataSource.transaction(async (manager) => {
      const instrumento = manager.create(Instrumento, {
        tipo: TIPO_INSTRUMENTO3,
        ocupacion: dto.nombreOcupacion,
        estado: Instrumento3Estado.BORRADOR,
        fecha: this.parseFecha(dto.fecha),
        usuario: idUsuario ? ({ idUsuario } as Usuario) : undefined,
      });
      const guardado = await manager.save(Instrumento, instrumento);

      await manager.save(
        Instrumento3Propuesta,
        manager.create(Instrumento3Propuesta, {
          ...this.toColumnasEscalares(dto),
          instrumento: { idInstrumento: guardado.idInstrumento } as Instrumento,
        }),
      );

      await this.regenerarPreguntas(manager, guardado.idInstrumento, dto);
      return guardado.idInstrumento;
    });

    this.logger.log(`Instrumento 3 creado: #${id} (${dto.nombreOcupacion})`);
    return this.findById(id);
  }

  /** Edita la propuesta. Bloqueado una vez enviada al experto. */
  async update(id: number, dto: UpdateInstrumento3Dto): Promise<Instrumento3DetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const row = await this.findInstrumentoOrThrow(manager, id);
      this.assertNoEnviado(row);

      const propuesta = await this.findPropuesta(manager, id);

      // Las listas viven solo en `pregunta`: hay que releerlas y conservarlas
      // cuando el PATCH no las manda, o regenerar el snapshot las borraría.
      const actuales = (await this.cargarPreguntasEnLote(manager, [id])).get(id) ?? [];
      const listaActual = (identificador: string) =>
        actuales.filter((p) => p.identificador === identificador).map((p) => p.detalle);

      const fusionado = {
        ...this.toDtoPlano(propuesta),
        funciones: listaActual('funcion'),
        denominaciones: listaActual('denominacion'),
        habilidades: listaActual('habilidad'),
        conocimientos: listaActual('conocimiento'),
        ocupacionesRelacionadas: listaActual('relacionada'),
        ...dto,
      } as CreateInstrumento3Dto;

      if (propuesta) {
        await manager.update(
          Instrumento3Propuesta,
          { idPropuesta: propuesta.idPropuesta },
          this.toColumnasEscalares(fusionado),
        );
      } else {
        await manager.save(
          Instrumento3Propuesta,
          manager.create(Instrumento3Propuesta, {
            ...this.toColumnasEscalares(fusionado),
            instrumento: { idInstrumento: id } as Instrumento,
          }),
        );
      }

      if (dto.nombreOcupacion) row.ocupacion = dto.nombreOcupacion;
      if (dto.fecha) row.fecha = this.parseFecha(dto.fecha)!;
      row.estado = Instrumento3Estado.BORRADOR;
      await manager.save(Instrumento, row);

      await this.regenerarPreguntas(manager, id, fusionado);
    });

    return this.findById(id);
  }

  /** Confirma la edición: BORRADOR → GUARDADO. */
  async guardar(id: number): Promise<Instrumento3DetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const row = await this.findInstrumentoOrThrow(manager, id);
      this.assertNoEnviado(row);

      const propuesta = await this.findPropuesta(manager, id);
      if (!propuesta?.nombreOcupacion?.trim()) {
        throw new ConflictException('La propuesta necesita al menos el nombre de la ocupación.');
      }

      row.estado = Instrumento3Estado.GUARDADO;
      await manager.save(Instrumento, row);
    });

    return this.findById(id);
  }

  /** GUARDADO → ENVIADO_EXPERTO: a partir de aquí lo ve Validación Experta. */
  async enviarExperto(id: number): Promise<Instrumento3DetailDto> {
    let idUsuarioAnalista: number | null = null;
    await this.dataSource.transaction(async (manager) => {
      const row = await this.findInstrumentoOrThrow(manager, id);
      if (row.estado !== Instrumento3Estado.GUARDADO) {
        throw new ConflictException(
          'La propuesta debe estar en estado GUARDADO antes de enviarla a experto.',
        );
      }

      idUsuarioAnalista = row.usuario?.idUsuario ?? null;
      row.estado = Instrumento3Estado.ENVIADO_EXPERTO;
      await manager.save(Instrumento, row);

      // OJO: aquí NO se regenera el snapshot. `pregunta` ya contiene lo que el
      // analista guardó (create/update lo escriben) y es la ÚNICA fuente de las
      // listas; regenerarlo desde las columnas escalares las borraría.
      // Enviar a experto solo cambia el estado, no el contenido.
    });

    this.logger.log(`Instrumento 3 #${id} enviado a experto`);
    const enviado = await this.findById(id);

    try {
      const nombreOcupacion = enviado.nombreOcupacion || `ID #${id}`;

      // 1. Notificación para el EXPERTO (pendiente de revisión)
      notificacionesStore.agregar({
        rolDestino: 'EXPERTO',
        titulo: 'Nuevo Instrumento 3 pendiente de revisión',
        mensaje: `Has recibido la propuesta de Instrumento 3 ("${nombreOcupacion}") para su revisión y validación experta.`,
        tipoEvento: 'INSTRUMENTO3_ENVIADO',
        idInstrumento: id,
        ruta: '/validacion-experta',
      });

      // 2. Notificación para el ANALISTA (confirmación de éxito)
      notificacionesStore.agregar({
        rolDestino: 'ANALISTA',
        idUsuario: idUsuarioAnalista,
        titulo: 'Propuesta Instrumento 3 enviada con éxito',
        mensaje: `La propuesta de Instrumento 3 ("${nombreOcupacion}") fue enviada con éxito para validación del experto.`,
        tipoEvento: 'INSTRUMENTO3_ENVIADO',
        idInstrumento: id,
        ruta: '/instrumento3',
      });
    } catch (err) {
      this.logger.warn(`No se pudo emitir la notificación de Instrumento 3 #${id}: ${err}`);
    }

    return enviado;
  }

  async remove(id: number): Promise<{ success: boolean }> {
    const row = await this.findInstrumentoOrThrow(this.instrumentoRepo.manager, id);
    this.assertNoEnviado(row);
    // instrumento3_propuesta y pregunta caen por ON DELETE CASCADE / borrado
    // explícito. Las respuestas de rondas anteriores van primero: apuntan a
    // `pregunta` (sus pregunta_respuesta caen en cascada).
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Respuesta, { instrumento: { idInstrumento: id } as any });
      await manager.delete(Pregunta, { instrumento: { idInstrumento: id } as any });
      await manager.delete(Instrumento, { idInstrumento: id });
    });
    return { success: true };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async findInstrumentoOrThrow(manager: EntityManager, id: number): Promise<Instrumento> {
    const row = await manager.findOne(Instrumento, {
      where: { idInstrumento: id, tipo: TIPO_INSTRUMENTO3 },
      relations: ['usuario'],
    });
    if (!row) throw new NotFoundException(`No existe una propuesta de Instrumento 3 con id ${id}.`);
    return row;
  }

  private async findPropuesta(
    manager: EntityManager,
    id: number,
  ): Promise<Instrumento3Propuesta | null> {
    return manager.findOne(Instrumento3Propuesta, {
      where: { instrumento: { idInstrumento: id } },
    });
  }

  private assertNoEnviado(row: Instrumento): void {
    if (row.estado !== Instrumento3Estado.BORRADOR && row.estado !== Instrumento3Estado.GUARDADO) {
      throw new ConflictException(
        `La propuesta ya fue enviada a experto (estado ${row.estado}) y no admite edición.`,
      );
    }
  }

  /**
   * Reescribe el snapshot plano de `pregunta`. Mismos `identificador` que
   * Instrumento 2, para que el experto reciba ambos instrumentos igual.
   * Reemplaza la ronda vigente mientras nadie la haya respondido; si ya tiene
   * respuestas escribe la siguiente (ver `rondas-snapshot`).
   */
  private async regenerarPreguntas(
    manager: EntityManager,
    instrumentoId: number,
    dto: CreateInstrumento3Dto,
  ): Promise<void> {
    const ronda = await prepararRondaParaEscribir(manager, instrumentoId);

    const filas: Partial<Pregunta>[] = [];
    const ref = { idInstrumento: instrumentoId } as Instrumento;

    const simple = (identificador: string, valor: string | number | null | undefined) => {
      const texto = valor === null || valor === undefined ? '' : String(valor).trim();
      if (!texto) return;
      filas.push({ identificador, detalle: texto, ronda, instrumento: ref });
    };

    simple('nombre', dto.nombreOcupacion);
    simple('descripcion', dto.descripcion);
    simple('area_desempeno', dto.areaDesempeno);
    simple('nivel_cualificacion', dto.nivelCualificacion);
    simple('cod_ocupacion_cno', dto.codOcupacionCNO);
    simple('cod_ocupacion_cuoc', dto.codOcupacionCUOC);
    simple('otras_habilidades', dto.otrasHabilidades);
    simple('otros_conocimientos', dto.otrosConocimientos);

    for (const { campo, identificador } of LISTAS) {
      const items = (dto[campo] as string[] | undefined) ?? [];
      for (const item of items) {
        const texto = String(item ?? '').trim();
        if (!texto) continue;
        filas.push({ identificador, detalle: texto, ronda, instrumento: ref });
      }
    }

    if (filas.length > 0) {
      await manager.insert(Pregunta, filas as Pregunta[]);
    }
  }

  private async cargarPreguntasEnLote(
    manager: EntityManager,
    ids: number[],
  ): Promise<Map<number, PreguntaSnapshotDto[]>> {
    const mapa = new Map<number, PreguntaSnapshotDto[]>();
    if (ids.length === 0) return mapa;

    const todas = await manager.find(Pregunta, {
      where: { instrumento: { idInstrumento: In(ids) } },
      order: { idPregunta: 'ASC' },
      loadRelationIds: { relations: ['instrumento'] },
    });
    // Solo la ronda vigente: las anteriores se conservan por sus respuestas.
    const filas = soloRondaVigente(todas, (fila) => fila.instrumento as unknown as number);

    for (const fila of filas) {
      const instrumentoId = fila.instrumento as unknown as number;
      const items = mapa.get(instrumentoId) ?? [];
      items.push({
        id: fila.idPregunta,
        identificador: fila.identificador,
        detalle: fila.detalle,
        codigo: fila.otro ?? null,
      });
      mapa.set(instrumentoId, items);
    }

    return mapa;
  }

  /** Extrae del DTO solo las columnas escalares de `instrumento3_propuesta`. */
  private toColumnasEscalares(dto: CreateInstrumento3Dto): Partial<Instrumento3Propuesta> {
    return {
      nombreApellidos: dto.nombreApellidos ?? null,
      email: dto.email ?? null,
      telefono: dto.telefono ?? null,
      departamento: dto.departamento ?? null,
      municipio: dto.municipio ?? null,
      empresaEntidad: dto.empresaEntidad ?? null,
      cargo: dto.cargo ?? null,
      profesion: dto.profesion ?? null,
      sector: dto.sector ?? null,
      codOcupacionCNO: dto.codOcupacionCNO ?? null,
      codOcupacionCUOC: dto.codOcupacionCUOC ?? null,
      nombreOcupacion: dto.nombreOcupacion ?? null,
      codArea: dto.codArea ?? null,
      areaDesempeno: dto.areaDesempeno ?? null,
      codNivelCualificacion: dto.codNivelCualificacion ?? null,
      nivelCualificacion: dto.nivelCualificacion ?? null,
      descripcion: dto.descripcion ?? null,
      otrasHabilidades: dto.otrasHabilidades ?? null,
      otrosConocimientos: dto.otrosConocimientos ?? null,
    };
  }

  /** Vuelca la entidad a la forma del DTO de entrada (para fusionar en update). */
  private toDtoPlano(propuesta: Instrumento3Propuesta | null): Partial<CreateInstrumento3Dto> {
    if (!propuesta) return {};
    return {
      nombreApellidos: propuesta.nombreApellidos ?? undefined,
      email: propuesta.email ?? undefined,
      telefono: propuesta.telefono ?? undefined,
      departamento: propuesta.departamento ?? undefined,
      municipio: propuesta.municipio ?? undefined,
      empresaEntidad: propuesta.empresaEntidad ?? undefined,
      cargo: propuesta.cargo ?? undefined,
      profesion: propuesta.profesion ?? undefined,
      sector: propuesta.sector ?? undefined,
      codOcupacionCNO: propuesta.codOcupacionCNO ?? undefined,
      codOcupacionCUOC: propuesta.codOcupacionCUOC ?? undefined,
      nombreOcupacion: propuesta.nombreOcupacion ?? '',
      codArea: propuesta.codArea ?? undefined,
      areaDesempeno: propuesta.areaDesempeno ?? undefined,
      codNivelCualificacion: propuesta.codNivelCualificacion ?? undefined,
      nivelCualificacion: propuesta.nivelCualificacion ?? undefined,
      descripcion: propuesta.descripcion ?? undefined,
      otrasHabilidades: propuesta.otrasHabilidades ?? undefined,
      otrosConocimientos: propuesta.otrosConocimientos ?? undefined,
    };
  }

  private toDto(
    row: Instrumento,
    propuesta: Instrumento3Propuesta | undefined | null,
    preguntas: PreguntaSnapshotDto[],
  ): Instrumento3DetailDto {
    // Las listas se reconstruyen desde el snapshot: es la única fuente
    const porIdentificador = (identificador: string): string[] =>
      preguntas.filter((p) => p.identificador === identificador).map((p) => p.detalle);

    return {
      id: row.idInstrumento,
      estado: (row.estado as Instrumento3Estado) ?? Instrumento3Estado.BORRADOR,
      fecha: this.fechaAIso(row.fecha),
      analista: row.usuario?.usuario ?? null,

      nombreApellidos: propuesta?.nombreApellidos ?? null,
      email: propuesta?.email ?? null,
      telefono: propuesta?.telefono ?? null,
      departamento: propuesta?.departamento ?? null,
      municipio: propuesta?.municipio ?? null,
      empresaEntidad: propuesta?.empresaEntidad ?? null,
      cargo: propuesta?.cargo ?? null,
      profesion: propuesta?.profesion ?? null,
      sector: propuesta?.sector ?? null,

      nombreOcupacion: propuesta?.nombreOcupacion ?? row.ocupacion ?? '',
      codOcupacionCNO: propuesta?.codOcupacionCNO ?? null,
      codOcupacionCUOC: propuesta?.codOcupacionCUOC ?? null,
      codArea: propuesta?.codArea ?? null,
      areaDesempeno: propuesta?.areaDesempeno ?? null,
      codNivelCualificacion: propuesta?.codNivelCualificacion ?? null,
      nivelCualificacion: propuesta?.nivelCualificacion ?? null,
      descripcion: propuesta?.descripcion ?? null,
      otrasHabilidades: propuesta?.otrasHabilidades ?? null,
      otrosConocimientos: propuesta?.otrosConocimientos ?? null,

      funciones: porIdentificador('funcion'),
      denominaciones: porIdentificador('denominacion'),
      habilidades: porIdentificador('habilidad'),
      conocimientos: porIdentificador('conocimiento'),
      ocupacionesRelacionadas: porIdentificador('relacionada'),

      preguntas,
    };
  }

  private parseFecha(valor: string | null | undefined): Date | undefined {
    if (!valor) return new Date();
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? new Date() : fecha;
  }

  private fechaAIso(valor: Date | string | null | undefined): string | null {
    if (!valor) return null;
    if (typeof valor === 'string') return valor;
    return valor.toISOString();
  }
}
