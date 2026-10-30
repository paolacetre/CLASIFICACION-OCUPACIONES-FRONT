import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { Instrumento } from './entities/instrumento.entity';
import { ESTADOS_REVISADOS, Instrumento2Estado } from './enums/instrumento2-estado.enum';
import { Instrumento2DetailDto } from './dto/instrumento2-detail.dto';
import { UpdateInstrumento2Dto } from './dto/update-instrumento2.dto';
import { FuncionSnapshotDto, NombreSnapshotDto } from './dto/item-snapshot.dto';
import { PreguntaSnapshotDto } from './dto/pregunta-snapshot.dto';
import { GuardarValidacionExpertaDto } from '../validacion-experta/dto/validacion-experta.dto';
import { ValidacionExpertaService } from '../validacion-experta/validacion-experta.service';
import { CnoOcupacion } from '../cno/entities/cno-ocupacion.entity';
import { CuocOcupacion } from '../cuoc/entities/cuoc-ocupacion.entity';
import { ComparativaOcupacion } from '../analisis/entities/comparativa-ocupacion.entity';
import { Pregunta } from '../encuesta/entities/pregunta.entity';
import { Respuesta } from '../encuesta/entities/respuesta.entity';
import { prepararRondaParaEscribir, rondaVigente, soloRondaVigente } from '../encuesta/rondas-snapshot';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../../common/enums/role.enum';
import { OcupacionCopiaInput, OcupacionCopiaService } from '../ocupacion-copia/ocupacion-copia.service';
import { codigosOcupacionesDeInstrumento, ocupacionDeItem } from './ocupaciones-de-instrumento';
import { MAX_OCUPACIONES_ENVIO, MIN_OCUPACIONES_ENVIO } from './dto/enviar-experto-instrumento2.dto';
import { codigoItem, ordenarPorSecuencia } from './codigos-item';
import { notificacionesStore } from '../shared/notificaciones.store';

const RELACIONES_CNO = [
  'usuario',
  'comparativaOcupacion',
  // Sin estas dos, la ocupación CNO y la CUOC "primarias" de la comparativa
  // (las que viven en las columnas cod_ocupacion_cno / cod_ocupacion_cuoc) se
  // pierden y el instrumento parece traer una sola ocupación en vez del grupo.
  'comparativaOcupacion.ocupacionCno',
  'comparativaOcupacion.ocupacionCuoc',
];

const RELACIONES_COPIA_CNO = [
  'areaDesempeno',
  'nivelCualificacion',
  'funciones.funcion',
  'denominaciones',
  'habilidades.habilidadDestreza',
  'conocimientos.conocimiento',
  'relacionadas',
];

const RELACIONES_COPIA_CUOC = [
  'areaCualificacion',
  'nivelCompetencia',
  'funciones',
  'denominaciones',
  'destrezas.habilidadDestreza',
  'regConocimientos.conocimiento',
  'ocupacionesAfines',
];

/** Estados en los que el instrumento ya está en manos de los expertos (o pasó por ellos). */
const ESTADOS_ENVIADOS: readonly string[] = [Instrumento2Estado.ENVIADO_EXPERTO, ...ESTADOS_REVISADOS];

/**
 * Estado legible de una función o denominación de la copia (smallint en BD).
 * Va en el detalle para que Comparativa lo devuelva intacto al editar y para
 * marcar el ítem en el snapshot que recibe el experto. NULL cuenta como activo.
 */
const estadoDeItem = (estado: number | null | undefined): 'Activo' | 'Inactivo' =>
  estado === 0 ? 'Inactivo' : 'Activo';
type CopiaResuelta =
  | { tipo: 'CNO'; ocupacion: CnoOcupacion }
  | { tipo: 'CUOC'; ocupacion: CuocOcupacion };

/**
 * CRUD + flujo de estados de la bandeja de Instrumento 2, apoyado por
 * completo en tablas ya existentes: `instrumento` (cabecera), la copia de
 * ocupación (CNO o CUOC, resuelta dinámicamente vía `instrumento.ocupacion`)
 * como contenido editable, y `pregunta` como snapshot plano de lo que se
 * envía a los expertos (por rondas, ver `rondas-snapshot`).
 */
@Injectable()
export class Instrumento2Service {
  private readonly logger = new Logger(Instrumento2Service.name);

  constructor(
    @InjectRepository(Instrumento)
    private readonly instrumentoRepo: Repository<Instrumento>,

    @InjectRepository(Pregunta)
    private readonly preguntaRepo: Repository<Pregunta>,

    private readonly validacionExpertaService: ValidacionExpertaService,

    private readonly ocupacionCopiaService: OcupacionCopiaService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(usuario?: AuthenticatedUser): Promise<Instrumento2DetailDto[]> {
    const manager = this.instrumentoRepo.manager;
    let rows = await this.instrumentoRepo.find({
      where: { tipo: 'instrumento2' },
      relations: RELACIONES_CNO,
      order: { idInstrumento: 'DESC' },
    });

    // El experto solo ve lo que le asignaron (más los históricos sin
    // asignación, que antes veían todos).
    if (usuario && String(usuario.rol).toUpperCase() === Role.EXPERTO) {
      const visibles = await this.validacionExpertaService.instrumentosVisiblesParaExperto(
        manager,
        usuario.idUsuario,
        rows.map((row) => row.idInstrumento),
      );
      rows = rows.filter((row) => visibles.has(row.idInstrumento));
    }

    // Precarga en 2 consultas ligeras el resumen (código/nombre/nivel/área) de
    // TODAS las ocupaciones del listado. Sin esto, cada instrumento resolvía sus
    // ocupaciones una por una con `resolverCopia`, que arrastra 7 relaciones
    // hijas solo para leer el nombre → N+1 sobre consultas pesadas.
    const resumenes = await this.cargarResumenesEnLote(manager, rows);
    // Igual que los resúmenes: una sola consulta para el snapshot de todos
    const preguntas = await this.cargarPreguntasEnLote(manager, rows);
    return Promise.all(rows.map((row) => this.toDto(manager, row, resumenes, preguntas)));
  }

  async findById(id: number): Promise<Instrumento2DetailDto> {
    const row = await this.findInstrumentoOrThrow(this.instrumentoRepo.manager, id);
    return this.toDto(this.instrumentoRepo.manager, row);
  }

  async getComparacion(id: number): Promise<Instrumento2DetailDto[]> {
    const manager = this.instrumentoRepo.manager;
    const row = await this.findInstrumentoOrThrow(manager, id);
    const codes = this.getCodigosOcupaciones(row);
    const preguntas = (await this.cargarPreguntasEnLote(manager, [row])).get(row.idInstrumento) ?? [];
    const enviadas = this.ocupacionesDelSnapshot(row, preguntas);
    const detalles = await Promise.all(codes.map((code) => this.toOcupacionDto(manager, row, code)));
    return detalles.map((detalle) => ({ ...detalle, ocupacionesEnviadas: enviadas }));
  }

  async update(id: number, dto: UpdateInstrumento2Dto): Promise<Instrumento2DetailDto> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const row = await this.findInstrumentoOrThrow(qr.manager, id);
      this.assertNotEnviado(row);

      const codigoTarget = dto.codigoOcupacion || row.ocupacion;
      const copia = await this.resolverCopia(qr.manager, codigoTarget);

      const cambios: OcupacionCopiaInput = {
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        nivelCualificacion: dto.nivelCualificacion,
        areaDesempeno: dto.areaDesempeno,
        fechaRegistro: dto.fechaRegistro,
        fechaInactividad: dto.fechaInactividad,
        trazabilidad: dto.trazabilidad,
      };

      if (copia.tipo === 'CNO') {
        await this.ocupacionCopiaService.actualizarOcupacionCno(qr, codigoTarget, cambios);
      } else {
        await this.ocupacionCopiaService.actualizarOcupacionCuoc(qr, codigoTarget, cambios);
      }

      // El formulario de edición siempre manda las 5 listas juntas (son el
      // estado completo del borrador que el analista está revisando), así
      // que si llega cualquiera de ellas se reemplazan todas a la vez.
      const llegaronListas =
        dto.funciones !== undefined ||
        dto.denominaciones !== undefined ||
        dto.habilidades !== undefined ||
        dto.conocimientos !== undefined ||
        dto.ocupacionesRelacionadas !== undefined;

      if (llegaronListas) {
        // El detalle entrega funciones y denominaciones con el código
        // NORMALIZADO ("F-0112.01"), que es de presentación. Quien edita suele
        // devolver lo que recibió, y `copiarFuncionesCno` busca la función del
        // catálogo por código: con el normalizado no la encontraría y crearía
        // una función de catálogo falsa. Se traduce de vuelta al interno.
        const actual = await this.toOcupacionDto(qr.manager, row, codigoTarget);
        const listas: OcupacionCopiaInput = {
          funciones: this.conCodigoInterno(dto.funciones ?? [], actual.funciones),
          denominaciones: this.conCodigoInterno(dto.denominaciones ?? [], actual.denominaciones),
          habilidades: dto.habilidades ?? [],
          conocimientos: dto.conocimientos ?? [],
          ocupacionesRelacionadas: dto.ocupacionesRelacionadas ?? [],
        };
        if (copia.tipo === 'CNO') {
          await this.ocupacionCopiaService.reemplazarHijosCno(qr, codigoTarget, listas);
        } else {
          await this.ocupacionCopiaService.reemplazarHijosCuoc(qr, codigoTarget, listas);
        }
      }

      if (dto.descripcion !== undefined && row.comparativaOcupacion) {
        await qr.manager.update(
          'comparativa_ocupacion',
          { codigo: row.comparativaOcupacion.codigo },
          { descripcion: dto.descripcion },
        );
      }

      if (dto.observacion !== undefined) {
        row.observacion = dto.observacion;
      }
      // Editar SIEMPRE deja el instrumento en EN_REVISION, que es el estado que
      // Comparativa pinta como «Editado»: es lo que permite distinguir de un
      // vistazo una comparativa retocada por el analista de una que llegó de
      // Análisis y nadie ha tocado.
      //
      // Antes se conservaba GUARDADO para que la barra de Instrumento 2 no
      // bajara de 70% a 35% al corregir un dato. Se acepta ese retroceso: el
      // estado tiene que reflejar que hubo una edición.
      //
      // Consecuencia a tener presente: `enviarExperto` exige GUARDADO, así que
      // quien edite debe volver a consolidar (POST /:id/guardar) antes de
      // enviar. Comparativa encadena ambas llamadas por eso.
      // ENVIADO_EXPERTO ya se rechaza antes, en assertNotEnviado.
      row.estado = Instrumento2Estado.EN_REVISION;
      await qr.manager.save(Instrumento, row);

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }

    return this.findById(id);
  }

  /** Confirma el borrador actual: transiciona a GUARDADO y refleja el snapshot en `pregunta`. */
  async guardar(id: number): Promise<Instrumento2DetailDto> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const row = await this.findInstrumentoOrThrow(qr.manager, id);
      this.assertNotEnviado(row);

      row.estado = Instrumento2Estado.GUARDADO;
      await qr.manager.save(Instrumento, row);
      // El borrador consolidado lleva TODAS las ocupaciones: cuáles van al
      // experto se decide al enviar, y ahí se reescribe el snapshot.
      await this.regenerarPreguntas(qr.manager, row);

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }

    return this.findById(id);
  }

  /**
   * Envía a validación, a los expertos elegidos, las ocupaciones elegidas del
   * instrumento (de 1 a 3). El snapshot que se escribe aquí queda congelado:
   * es sobre lo que responden, y solo lleva las ocupaciones elegidas.
   */
  async enviarExperto(
    id: number,
    expertos: number[],
    ocupaciones: string[],
    enviadoPor?: AuthenticatedUser,
  ): Promise<Instrumento2DetailDto> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let idUsuarioAnalista: number | null = null;
    let row: Instrumento;
    try {
      row = await this.findInstrumentoOrThrow(qr.manager, id);
      if (row.estado !== Instrumento2Estado.GUARDADO) {
        throw new ConflictException('El instrumento debe estar en estado GUARDADO antes de enviarlo a experto.');
      }

      const elegidas = this.ocupacionesElegidas(row, ocupaciones);
      await this.asegurarPrincipalEntreElegidas(qr.manager, row, elegidas);

      idUsuarioAnalista = row.usuario?.idUsuario ?? null;
      row.estado = Instrumento2Estado.ENVIADO_EXPERTO;
      await qr.manager.save(Instrumento, row);
      const ronda = await this.regenerarPreguntas(qr.manager, row, elegidas);
      await this.validacionExpertaService.asignarExpertos(
        qr.manager,
        row,
        ronda,
        expertos,
        enviadoPor?.idUsuario ?? null,
      );

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }

    const resultado = await this.findById(id);

    try {
      const nombreOcupacion = resultado.ocupacion || `ID #${id}`;

      // 1. Notificación para cada EXPERTO asignado (y solo para ellos)
      this.validacionExpertaService.notificarAsignacion(row!, expertos, nombreOcupacion);

      // 2. Notificación para el ANALISTA (confirmación de éxito)
      notificacionesStore.agregar({
        rolDestino: 'ANALISTA',
        idUsuario: idUsuarioAnalista,
        titulo: 'Ocupación enviada con éxito',
        mensaje: `La ocupación (${nombreOcupacion}) fue enviada con éxito para validación del experto.`,
        tipoEvento: 'INSTRUMENTO2_ENVIADO',
        idInstrumento: id,
        ruta: '/instrumento2',
      });
    } catch (err) {
      this.logger.warn(`No se pudo emitir la notificación de Instrumento 2 #${id}: ${err}`);
    }

    return resultado;
  }

  /**
   * TEMPORAL — SOLO PARA PRUEBAS: capacidad de borrado agregada únicamente
   * para facilitar pruebas manuales de este flujo durante el desarrollo.
   * Eliminar este método (y `DELETE /:id` en `Instrumento2Controller`, y el
   * botón "Eliminar" en el frontend) cuando ya no se necesite.
   */
  async remove(id: number): Promise<{ success: boolean }> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const row = await this.findInstrumentoOrThrow(qr.manager, id);
      if (row.estado === Instrumento2Estado.ENVIADO_EXPERTO) {
        throw new ConflictException('No se puede eliminar: ya fue enviado a experto.');
      }

      const comparativaCodigo = row.comparativaOcupacion?.codigo ?? null;
      // Análisis copió los 3 paneles, no solo el que llegó a Instrumento 2: hay
      // que borrarlos todos o los otros dos quedan como filas huérfanas dentro
      // de cno_ocupacion/cuoc_ocupacion, ensuciando el catálogo real.
      const { codigosCno, codigosCuoc } = await this.recolectarCopias(qr.manager, row);

      // Orden estricto por FKs: respuestas (y sus pregunta_respuesta, en
      // cascada) -> pregunta -> instrumento -> comparativa_ocupacion -> copias
      // de ocupación (y sus hijos).
      await qr.manager.delete(Respuesta, { instrumento: { idInstrumento: id } as any });
      await qr.manager.delete(Pregunta, { instrumento: { idInstrumento: id } as any });
      await qr.manager.delete(Instrumento, { idInstrumento: id });
      if (comparativaCodigo !== null) {
        await qr.manager.delete('comparativa_ocupacion', { codigo: comparativaCodigo });
      }
      for (const codigo of codigosCno) {
        await this.ocupacionCopiaService.eliminarCopiaCno(qr, codigo);
      }
      for (const codigo of codigosCuoc) {
        await this.ocupacionCopiaService.eliminarCopiaCuoc(qr, codigo);
      }

      await qr.commitTransaction();
      return { success: true };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  /**
   * Elimina UNA sola ocupación del instrumento (su copia + su hueco en la
   * comparativa), dejando el instrumento con el resto de ocupaciones. Si era la
   * última, borra el instrumento completo. Devuelve la comparación resultante
   * (o `[]` si el instrumento dejó de existir).
   */
  async eliminarOcupacion(id: number, codigo: string): Promise<Instrumento2DetailDto[]> {
    const codigoLimpio = codigo.trim();
    const rowPrevio = await this.findInstrumentoOrThrow(this.instrumentoRepo.manager, id);
    this.assertNotEnviado(rowPrevio);

    const codes = this.getCodigosOcupaciones(rowPrevio);
    if (!codes.includes(codigoLimpio)) {
      throw new NotFoundException(`La ocupación "${codigoLimpio}" no pertenece a este instrumento.`);
    }
    // Última ocupación → equivale a borrar el instrumento entero.
    if (codes.length <= 1) {
      await this.remove(id);
      return [];
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const row = await this.findInstrumentoOrThrow(qr.manager, id);
      this.assertNotEnviado(row);
      const co = row.comparativaOcupacion;

      const cnoActual = [co?.ocupacionCno?.codOcupacionCno, co?.codOcupacionCno2, co?.codOcupacionCno3]
        .filter((c): c is string => !!c && c.trim().length > 0)
        .map((c) => c.trim());
      const cuocActual = [co?.ocupacionCuoc?.codOcupacionCuoc, co?.codOcupacionCuoc2, co?.codOcupacionCuoc3]
        .filter((c): c is string => !!c && c.trim().length > 0)
        .map((c) => c.trim());

      const cno = cnoActual.filter((c) => c !== codigoLimpio);
      const cuoc = cuocActual.filter((c) => c !== codigoLimpio);

      // 1. Quitar la referencia en la comparativa (FK: antes de tocar la copia).
      if (co) {
        await qr.manager.query(
          `UPDATE clasificacion.comparativa_ocupacion
              SET cod_ocupacion_cno = $2, cod_ocupacion_cno2 = $3, cod_ocupacion_cno3 = $4,
                  cod_ocupacion_cuoc = $5, cod_ocupacion_cuoc2 = $6, cod_ocupacion_cuoc3 = $7
            WHERE codigo = $1`,
          [
            co.codigo,
            cno[0] ?? null,
            cno[1] ?? null,
            cno[2] ?? null,
            cuoc[0] ?? null,
            cuoc[1] ?? null,
            cuoc[2] ?? null,
          ],
        );
      }

      // 2. Repuntar la "principal" del instrumento si era la que se quita.
      const nuevaPrincipal = row.ocupacion === codigoLimpio ? (cno[0] ?? cuoc[0]!) : row.ocupacion;
      await qr.manager.update(
        Instrumento,
        { idInstrumento: id },
        {
          ocupacion: nuevaPrincipal,
          estado:
            row.estado === Instrumento2Estado.ENVIADO_EXPERTO
              ? row.estado
              : Instrumento2Estado.EN_REVISION,
        },
      );

      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }

    // 3. Best-effort: borrar la copia de ocupación SI ya no la referencia nadie
    //    más (otras comparativas u otros instrumentos pueden compartir el mismo
    //    código derivado). Si falla, la copia queda huérfana pero inofensiva.
    await this.borrarCopiaSiHuerfana(codigoLimpio);

    return this.getComparacion(id);
  }

  /** Elimina la copia de ocupación solo si ninguna otra comparativa/instrumento la usa. */
  private async borrarCopiaSiHuerfana(codigo: string): Promise<void> {
    const manager = this.instrumentoRepo.manager;
    try {
      const referida = await manager.query(
        `SELECT 1
           FROM clasificacion.comparativa_ocupacion
          WHERE cod_ocupacion_cno = $1 OR cod_ocupacion_cno2 = $1 OR cod_ocupacion_cno3 = $1
             OR cod_ocupacion_cuoc = $1 OR cod_ocupacion_cuoc2 = $1 OR cod_ocupacion_cuoc3 = $1
          UNION ALL
         SELECT 1 FROM clasificacion.instrumento WHERE ocupacion = $1
          LIMIT 1`,
        [codigo],
      );
      if (Array.isArray(referida) && referida.length > 0) {
        return; // sigue en uso
      }

      const qr = this.dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        const copia = await this.resolverCopia(qr.manager, codigo);
        if (copia.tipo === 'CNO') {
          await this.ocupacionCopiaService.eliminarCopiaCno(qr, codigo);
        } else {
          await this.ocupacionCopiaService.eliminarCopiaCuoc(qr, codigo);
        }
        await qr.commitTransaction();
      } catch {
        await qr.rollbackTransaction();
      } finally {
        await qr.release();
      }
    } catch (error) {
      this.logger.warn(`No se pudo limpiar la copia "${codigo}": ${(error as Error).message}`);
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async findInstrumentoOrThrow(manager: EntityManager, id: number): Promise<Instrumento> {
    const row = await manager.findOne(Instrumento, {
      where: { idInstrumento: id, tipo: 'instrumento2' },
      relations: RELACIONES_CNO,
    });
    if (!row) {
      throw new NotFoundException('Instrumento 2 no encontrado');
    }
    return row;
  }

  /**
   * Devuelve los ítems con el código que vive en BD. Respeta `codigoInterno`
   * si el cliente lo reenvía; si solo trae el normalizado, lo resuelve contra
   * el detalle vigente. Un código desconocido (ítem nuevo, elegido del
   * catálogo) pasa tal cual.
   */
  private conCodigoInterno<T extends { codigo?: string; codigoInterno?: string }>(
    items: T[],
    vigentes: Array<{ codigo?: string; codigoInterno?: string }>,
  ): T[] {
    const internoPorNormalizado = new Map(
      vigentes.filter((v) => v.codigo).map((v) => [v.codigo!, v.codigoInterno]),
    );
    return items.map((item) => {
      const { codigoInterno, ...resto } = item;
      const codigo = codigoInterno?.trim()
        || (item.codigo && internoPorNormalizado.has(item.codigo)
          ? internoPorNormalizado.get(item.codigo) ?? undefined
          : item.codigo);
      return { ...resto, codigo } as T;
    });
  }

  private assertNotEnviado(row: Instrumento): void {
    if (row.estado === Instrumento2Estado.ENVIADO_EXPERTO) {
      throw new ConflictException('El instrumento ya fue enviado a experto y no admite edición.');
    }
  }

  /**
   * Valida la elección de ocupaciones a enviar y la devuelve en el orden del
   * instrumento (el mismo del snapshot y del modal del experto). El DTO ya
   * acota el tamaño; aquí se repite porque solo aquí se sabe qué ocupaciones
   * tiene el instrumento, y el servicio también se invoca desde código.
   */
  private ocupacionesElegidas(row: Instrumento, ocupaciones: string[] | null | undefined): string[] {
    const elegidas = [...new Set((ocupaciones ?? []).map((c) => c?.trim()).filter(Boolean))];
    if (elegidas.length < MIN_OCUPACIONES_ENVIO) {
      throw new BadRequestException('Selecciona al menos una ocupación para enviar.');
    }
    if (elegidas.length > MAX_OCUPACIONES_ENVIO) {
      throw new BadRequestException(`Puedes enviar como máximo ${MAX_OCUPACIONES_ENVIO} ocupaciones.`);
    }

    const delInstrumento = this.getCodigosOcupaciones(row);
    const ajenas = elegidas.filter((codigo) => !delInstrumento.includes(codigo));
    if (ajenas.length > 0) {
      throw new BadRequestException(
        `La(s) ocupación(es) ${ajenas.join(', ')} no pertenece(n) a este instrumento.`,
      );
    }
    return delInstrumento.filter((codigo) => elegidas.includes(codigo));
  }

  /**
   * Si la ocupación principal del instrumento no va en el envío, la principal
   * pasa a ser la primera elegida: es la que encabeza la bandeja del experto,
   * la que lleva la observación del analista y la que describe el registro
   * en Resumen.
   *
   * Antes de moverla se fija la ocupación de los ítems de `pregunta` que no
   * la tienen (anteriores a la migración 028): esos se atribuyen "a la
   * principal", y al cambiarla quedarían colgados de otra ocupación.
   */
  private async asegurarPrincipalEntreElegidas(
    manager: EntityManager,
    row: Instrumento,
    elegidas: string[],
  ): Promise<void> {
    const principalActual = ocupacionDeItem(null, row);
    if (elegidas.includes(principalActual)) return;

    if (principalActual) {
      await manager
        .createQueryBuilder()
        .update(Pregunta)
        .set({ codOcupacion: principalActual })
        .where('id_instrumento = :id AND cod_ocupacion IS NULL', { id: row.idInstrumento })
        .execute();
    }
    row.ocupacion = elegidas[0];
  }

  /**
   * Códigos de las copias de ocupación que pertenecen a este instrumento: las
   * registradas en su comparativa (hasta 3, una por panel) más la del propio
   * instrumento, por si es una fila antigua sin comparativa asociada.
   *
   * Cada código de la comparativa pasa por `esCodigoCopiaDe` antes de entrar a
   * la lista: las comparativas creadas antes de que Análisis copiara los tres
   * paneles guardaban el código ORIGINAL en los slots 2/3, y ese apunta a una
   * ocupación real del catálogo que no se puede borrar.
   */
  private async recolectarCopias(
    manager: EntityManager,
    row: Instrumento,
  ): Promise<{ codigosCno: string[]; codigosCuoc: string[] }> {
    const codigosCno = new Set<string>();
    const codigosCuoc = new Set<string>();

    const comparativaCodigo = row.comparativaOcupacion?.codigo ?? null;
    if (comparativaCodigo !== null) {
      // Se relee la comparativa con sus relaciones: `findInstrumentoOrThrow`
      // solo trae la cabecera, sin los códigos de ocupación referenciados.
      const comparativa = await manager.findOne(ComparativaOcupacion, {
        where: { codigo: comparativaCodigo },
        relations: ['ocupacionCno', 'ocupacionCuoc'],
      });

      const agregar = (destino: Set<string>, codigos: Array<string | null | undefined>) => {
        for (const codigo of codigos) {
          if (codigo && this.ocupacionCopiaService.esCodigoCopiaDe(codigo, comparativaCodigo)) {
            destino.add(codigo);
          }
        }
      };

      agregar(codigosCno, [
        comparativa?.ocupacionCno?.codOcupacionCno,
        comparativa?.codOcupacionCno2,
        comparativa?.codOcupacionCno3,
      ]);
      agregar(codigosCuoc, [
        comparativa?.ocupacionCuoc?.codOcupacionCuoc,
        comparativa?.codOcupacionCuoc2,
        comparativa?.codOcupacionCuoc3,
      ]);
    }

    if (!codigosCno.has(row.ocupacion) && !codigosCuoc.has(row.ocupacion)) {
      const copia = await this.resolverCopia(manager, row.ocupacion);
      (copia.tipo === 'CNO' ? codigosCno : codigosCuoc).add(row.ocupacion);
    }

    return { codigosCno: [...codigosCno], codigosCuoc: [...codigosCuoc] };
  }

  /** Determina si la copia editable de `codigoOcupacion` vive en CNO o en CUOC. */
  private async resolverCopia(manager: EntityManager, codigoOcupacion: string): Promise<CopiaResuelta> {
    // `relationLoadStrategy: 'query'` es clave: con la estrategia por defecto
    // ('join') TypeORM trae las 5 listas hijas en un único LEFT JOIN, lo que
    // produce un producto cartesiano (34 denominaciones x 20 conocimientos x 15
    // habilidades = ~10.000 filas para UNA ocupación). Con 'query' cada relación
    // va en su propia consulta pequeña y el coste queda lineal.
    const cno = await manager.findOne(CnoOcupacion, {
      where: { codOcupacionCno: codigoOcupacion },
      relations: RELACIONES_COPIA_CNO,
      relationLoadStrategy: 'query',
    });
    if (cno) {
      return { tipo: 'CNO', ocupacion: cno };
    }

    const cuoc = await manager.findOne(CuocOcupacion, {
      where: { codOcupacionCuoc: codigoOcupacion },
      relations: RELACIONES_COPIA_CUOC,
      relationLoadStrategy: 'query',
    });
    if (cuoc) {
      return { tipo: 'CUOC', ocupacion: cuoc };
    }

    throw new NotFoundException(
      `No se encontró la copia de ocupación "${codigoOcupacion}" en CNO ni en CUOC (dato inconsistente).`,
    );
  }

  getCodigosOcupaciones(row: Instrumento): string[] {
    return codigosOcupacionesDeInstrumento(row);
  }

  /**
   * Carga en LOTE (2 consultas, sin relaciones hijas) el resumen de todas las
   * ocupaciones referenciadas por un conjunto de instrumentos. Devuelve un mapa
   * `código → resumen` que `getOcupacionesResumen` consume sin volver a la BD.
   */
  private async cargarResumenesEnLote(
    manager: EntityManager,
    rows: Instrumento[],
  ): Promise<Map<string, any>> {
    const mapa = new Map<string, any>();
    const codigos = [...new Set(rows.flatMap((row) => this.getCodigosOcupaciones(row)))];
    if (codigos.length === 0) return mapa;

    const cnos = await manager.find(CnoOcupacion, {
      where: { codOcupacionCno: In(codigos) },
      relations: ['areaDesempeno', 'nivelCualificacion'],
    });
    for (const o of cnos) {
      mapa.set(o.codOcupacionCno, {
        codigo: o.codOcupacionCno,
        codigoOriginal: this.ocupacionCopiaService.extraerCodigoOriginal(
          o.codOcupacionCno,
          o.idComparativa,
        ),
        nombre: o.nombOcupacionCno || 'Sin nombre',
        panelOrigen: 'CNO',
        nivelCualificacion:
          o.nivelCualificacion?.nivelesCualificacion ?? o.nivelesCualificacion ?? null,
        areaDesempeno: o.areaDesempeno?.nomDesempeno ?? o.nomDesempeno ?? null,
      });
    }

    const faltantes = codigos.filter((c) => !mapa.has(c));
    if (faltantes.length > 0) {
      const cuocs = await manager.find(CuocOcupacion, {
        where: { codOcupacionCuoc: In(faltantes) },
        relations: ['areaCualificacion', 'nivelCompetencia'],
      });
      for (const o of cuocs) {
        mapa.set(o.codOcupacionCuoc, {
          codigo: o.codOcupacionCuoc,
          codigoOriginal: this.ocupacionCopiaService.extraerCodigoOriginal(
            o.codOcupacionCuoc,
            o.idComparativa,
          ),
          nombre: o.nomOcupacionCuoc || 'Sin nombre',
          panelOrigen: 'CUOC',
          nivelCualificacion: o.nivelCompetencia?.nombreNivel ?? null,
          areaDesempeno: o.areaCualificacion?.descripcion ?? null,
        });
      }
    }

    return mapa;
  }

  async getOcupacionesResumen(
    manager: EntityManager,
    row: Instrumento,
    cache?: Map<string, any>,
  ): Promise<any[]> {
    const codes = this.getCodigosOcupaciones(row);
    const results: any[] = [];
    for (const code of codes) {
      const precargado = cache?.get(code);
      if (precargado) {
        results.push(precargado);
        continue;
      }
      try {
        const copia = await this.resolverCopia(manager, code);
        if (copia.tipo === 'CNO') {
          results.push({
            codigo: code,
            codigoOriginal: this.ocupacionCopiaService.extraerCodigoOriginal(
              code,
              copia.ocupacion.idComparativa,
            ),
            nombre: copia.ocupacion.nombOcupacionCno || 'Sin nombre',
            panelOrigen: 'CNO',
            nivelCualificacion: copia.ocupacion.nivelCualificacion?.nivelesCualificacion ?? copia.ocupacion.nivelesCualificacion ?? null,
            areaDesempeno: copia.ocupacion.areaDesempeno?.nomDesempeno ?? copia.ocupacion.nomDesempeno ?? null,
          });
        } else {
          results.push({
            codigo: code,
            codigoOriginal: this.ocupacionCopiaService.extraerCodigoOriginal(
              code,
              copia.ocupacion.idComparativa,
            ),
            nombre: copia.ocupacion.nomOcupacionCuoc || 'Sin nombre',
            panelOrigen: 'CUOC',
            nivelCualificacion: copia.ocupacion.nivelCompetencia?.nombreNivel ?? null,
            areaDesempeno: copia.ocupacion.areaCualificacion?.descripcion ?? null,
          });
        }
      } catch {
        results.push({
          codigo: code,
          codigoOriginal: code,
          nombre: code,
          panelOrigen: 'CNO',
        });
      }
    }
    return results;
  }

  private async toDto(
    manager: EntityManager,
    row: Instrumento,
    cache?: Map<string, any>,
    preguntasPorInstrumento?: Map<number, PreguntaSnapshotDto[]>,
  ): Promise<Instrumento2DetailDto> {
    const codes = this.getCodigosOcupaciones(row);
    const primaryCode = row.ocupacion || codes[0];
    const dto = await this.toOcupacionDto(manager, row, primaryCode);
    dto.ocupaciones = await this.getOcupacionesResumen(manager, row, cache);

    // El snapshot de `pregunta` es lo que el experto valida. En el listado se
    // precarga en lote (ver findAll) para no disparar un N+1.
    dto.preguntas =
      preguntasPorInstrumento?.get(row.idInstrumento) ??
      (await this.cargarPreguntasEnLote(manager, [row])).get(row.idInstrumento) ??
      [];
    dto.ocupacionesEnviadas = this.ocupacionesDelSnapshot(row, dto.preguntas);

    return dto;
  }

  /**
   * Qué ocupaciones se enviaron al experto. No se guarda aparte: es lo que
   * lleva el snapshot vigente de `pregunta`, que es justo lo que el experto
   * valida. null mientras no se haya enviado (el borrador lleva todas).
   */
  private ocupacionesDelSnapshot(row: Instrumento, preguntas: PreguntaSnapshotDto[]): string[] | null {
    if (!ESTADOS_ENVIADOS.includes(row.estado) || preguntas.length === 0) return null;
    const presentes = new Set(preguntas.map((p) => p.codOcupacion));
    const enviadas = this.getCodigosOcupaciones(row).filter((codigo) => presentes.has(codigo));
    return enviadas.length > 0 ? enviadas : null;
  }

  /**
   * Carga en UNA consulta el snapshot de `pregunta` de varios instrumentos.
   * Devuelve un mapa idInstrumento → ítems, en el orden en que se generaron,
   * cada uno con la ocupación a la que pertenece (la principal si la fila es
   * anterior a la migración 028).
   */
  private async cargarPreguntasEnLote(
    manager: EntityManager,
    rows: Instrumento[],
  ): Promise<Map<number, PreguntaSnapshotDto[]>> {
    const mapa = new Map<number, PreguntaSnapshotDto[]>();
    if (rows.length === 0) return mapa;
    const porId = new Map(rows.map((row) => [row.idInstrumento, row]));

    const todas = await manager.find(Pregunta, {
      where: { instrumento: { idInstrumento: In([...porId.keys()]) } },
      order: { idPregunta: 'ASC' },
      // Sin esto TypeORM traería la entidad Instrumento completa por cada fila
      loadRelationIds: { relations: ['instrumento'] },
    });
    // Las rondas anteriores siguen en la tabla (tienen respuestas); lo que se
    // muestra y se valida es la vigente.
    const filas = soloRondaVigente(todas, (fila) => fila.instrumento as unknown as number);
    // Snapshot anterior a la migración 028: sus ítems no dicen de qué ocupación son.
    const antiguos = new Set(
      filas.filter((fila) => !fila.codOcupacion?.trim()).map((fila) => fila.instrumento as unknown as number),
    );

    for (const fila of filas) {
      // Con loadRelationIds la relación llega como el id crudo
      const instrumentoId = fila.instrumento as unknown as number;
      const row = porId.get(instrumentoId);
      if (!row) continue;
      const items = mapa.get(instrumentoId) ?? [];
      items.push({
        id: fila.idPregunta,
        identificador: fila.identificador,
        detalle: fila.detalle,
        codigo: fila.otro ?? null,
        codOcupacion: ocupacionDeItem(fila.codOcupacion, row),
        inactivo: fila.inactivo ?? false,
      });
      mapa.set(instrumentoId, items);
    }

    for (const row of rows.filter((r) => antiguos.has(r.idInstrumento))) {
      await this.completarSnapshotEnMemoria(manager, row, mapa);
    }

    return mapa;
  }

  /**
   * Instrumentos enviados a experto ANTES de que el snapshot guardara todas
   * las ocupaciones: su `pregunta` solo trae la principal. Para que el experto
   * pueda validarlas sin que el analista tenga que reenviar, se agregan en
   * memoria (sin escribir) los ítems de las ocupaciones que faltan. Al guardar
   * una validación se persisten de verdad (ver `completarSnapshotPersistido`).
   *
   * Solo aplica a esos snapshots antiguos (ítems sin `cod_ocupacion`). Los
   * actuales llevan exactamente las ocupaciones que se eligieron al enviar:
   * completarlos metería al experto las que se dejaron fuera.
   */
  private async completarSnapshotEnMemoria(
    manager: EntityManager,
    row: Instrumento,
    mapa: Map<number, PreguntaSnapshotDto[]>,
  ): Promise<void> {
    if (row.estado !== Instrumento2Estado.ENVIADO_EXPERTO) return;
    const items = mapa.get(row.idInstrumento);
    if (!items || items.length === 0) return;

    const presentes = new Set(items.map((item) => item.codOcupacion));
    const faltantes = this.getCodigosOcupaciones(row).filter((codigo) => !presentes.has(codigo));
    for (const codigo of faltantes) {
      try {
        const detalle = await this.toOcupacionDto(manager, row, codigo);
        for (const item of this.itemsSnapshot(detalle, null)) {
          items.push({
            id: 0,
            identificador: item.identificador,
            detalle: item.detalle,
            codigo: item.otro,
            codOcupacion: codigo,
            inactivo: item.inactivo,
          });
        }
      } catch (error) {
        this.logger.warn(
          `No se pudo completar el snapshot de "${codigo}" en el instrumento ${row.idInstrumento}: ${(error as Error).message}`,
        );
      }
    }
  }

  // ─── Validación experta ────────────────────────────────────────────────────
  // La lógica vive en ValidacionExpertaService porque es idéntica para
  // Instrumento 2 y 3; aquí solo se expone bajo la ruta de este instrumento.

  getValidacionExperta(id: number, usuario: AuthenticatedUser) {
    return this.validacionExpertaService.getValidacion(id, usuario, 'instrumento2');
  }

  getAvanceValidacion(id: number) {
    return this.validacionExpertaService.getAvance(id, 'instrumento2');
  }

  cerrarValidacion(id: number) {
    return this.validacionExpertaService.cerrarValidacion(id, 'instrumento2');
  }

  listarExpertosDisponibles() {
    return this.validacionExpertaService.listarExpertosDisponibles();
  }

  async guardarValidacionExperta(id: number, dto: GuardarValidacionExpertaDto, experto: AuthenticatedUser) {
    // Una sola transacción: si la validación se rechaza (p. ej. por
    // incompleta) no debe quedar persistido a medias el snapshot completado.
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const row = await this.findInstrumentoOrThrow(qr.manager, id);

      // Un instrumento enviado antes de que el snapshot guardara todas las
      // ocupaciones solo tiene la principal en `pregunta`; el experto las vio
      // todas (se le completaron en memoria). Para que cada respuesta tenga
      // su fila a la que apuntar, se agregan las que faltan. Solo AGREGA: la
      // ronda vigente puede tener ya respuestas de otros expertos.
      if (row.estado === Instrumento2Estado.ENVIADO_EXPERTO) {
        await this.completarSnapshotPersistido(qr.manager, row);
      }

      const resultado = await this.validacionExpertaService.guardar(
        id,
        dto,
        experto,
        'instrumento2',
        qr.manager,
      );
      await qr.commitTransaction();
      return resultado;
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  /**
   * Agrega a la ronda vigente los ítems de las ocupaciones que le faltan. Solo
   * a snapshots anteriores a la migración 028 (ver `completarSnapshotEnMemoria`).
   */
  private async completarSnapshotPersistido(manager: EntityManager, row: Instrumento): Promise<void> {
    const ronda = await rondaVigente(manager, row.idInstrumento);
    const filas = await manager.find(Pregunta, {
      where: { instrumento: { idInstrumento: row.idInstrumento }, ronda },
      select: { idPregunta: true, codOcupacion: true },
    });
    if (filas.length === 0 || filas.every((fila) => fila.codOcupacion?.trim())) return;

    const presentes = new Set(filas.map((fila) => ocupacionDeItem(fila.codOcupacion, row)));
    const nuevas: Partial<Pregunta>[] = [];
    for (const codigo of this.getCodigosOcupaciones(row).filter((c) => !presentes.has(c))) {
      const detalle = await this.toOcupacionDto(manager, row, codigo);
      for (const item of this.itemsSnapshot(detalle, null)) {
        nuevas.push({
          ...item,
          codOcupacion: codigo,
          ronda,
          instrumento: { idInstrumento: row.idInstrumento } as Instrumento,
        });
      }
    }
    if (nuevas.length > 0) {
      await manager.insert(Pregunta, nuevas as Pregunta[]);
    }
  }

  private async toOcupacionDto(manager: EntityManager, row: Instrumento, codigoOcupacion: string): Promise<Instrumento2DetailDto> {
    const copia = await this.resolverCopia(manager, codigoOcupacion);

    const base = {
      id: row.idInstrumento,
      estado: (row.estado as Instrumento2Estado) ?? Instrumento2Estado.PENDIENTE,
      ocupacion: codigoOcupacion,
      // El código que se enseña fuera de Análisis es el REAL del catálogo. El
      // de la copia ("2113-23-1") es un identificador interno del instrumento:
      // al experto y a los reportes no les dice nada y parece un dato corrupto.
      //
      // Se prefiere el `id_comparativa` de la propia fila (lo escribe
      // `copiarOcupacion*` y lo rellenó la migración 008). Se cae a la
      // comparativa del instrumento para las copias anteriores a esa migración
      // que no llegara a marcar: sin ese respaldo devolvía el código con
      // sufijo y el arreglo no se notaba.
      codigoOriginal: this.ocupacionCopiaService.extraerCodigoOriginal(
        codigoOcupacion,
        copia.ocupacion.idComparativa ?? row.comparativaOcupacion?.codigo,
      ),
      observacion: row.observacion ?? null,
      fecha: this.fechaAIso(row.fecha),
      analista: row.usuario?.usuario ?? null,
    };

    if (copia.tipo === 'CNO') {
      const o = copia.ocupacion;
      // El orden sale de la secuencia del registro de la OCUPACIÓN
      // (`cno_reg_funciones.codigo`), no del código del catálogo genérico
      // (`cno_funcion.cod_funcion`, "F-573"), que era lo que se mostraba y no
      // dice de qué ocupación es la función.
      //
      // `codigoInterno` conserva el código que la edición de la copia espera
      // de vuelta: para funciones es el del catálogo (así `copiarFuncionesCno`
      // la vuelve a enlazar a la misma función), para denominaciones el suyo.
      const funciones: FuncionSnapshotDto[] = ordenarPorSecuencia(o.funciones ?? [], (f) => f.codigo).map(
        (f, indice) => ({
          codigo: codigoItem('F', base.codigoOriginal, indice + 1),
          codigoInterno: f.funcion?.codFuncion ?? undefined,
          descripcion: f.descFuncionCno ?? undefined,
          estado: estadoDeItem(f.estado),
        }),
      );
      const denominaciones: NombreSnapshotDto[] = ordenarPorSecuencia(
        o.denominaciones ?? [],
        (d) => d.codDenominacionCno,
      ).map((d, indice) => ({
        codigo: codigoItem('D', base.codigoOriginal, indice + 1),
        codigoInterno: d.codDenominacionCno,
        nombre: d.descDenominacion ?? undefined,
        estado: estadoDeItem(d.estado),
      }));
      const habilidades: NombreSnapshotDto[] = (o.habilidades ?? []).map((h) => ({
        codigo: h.habilidadDestreza ? String(h.habilidadDestreza.codHabDest) : undefined,
        nombre: h.nombHabDest ?? undefined,
      }));
      const conocimientos: NombreSnapshotDto[] = (o.conocimientos ?? []).map((c) => ({
        codigo: c.conocimiento ? String(c.conocimiento.codConocimiento) : undefined,
        nombre: c.nombConocimiento ?? undefined,
      }));
      const ocupacionesRelacionadas: NombreSnapshotDto[] = (o.relacionadas ?? []).map((r) => ({
        codigo: r.codigoOcupacion ?? undefined,
        nombre: r.nombreOcupacion ?? undefined,
      }));

      return {
        ...base,
        panelOrigen: 'CNO',
        nombre: o.nombOcupacionCno ?? null,
        descripcion: o.descripcion ?? null,
        nivelCualificacion: o.nivelCualificacion?.nivelesCualificacion ?? o.nivelesCualificacion ?? null,
        codNivelCualificacion: o.nivelCualificacion?.codCualificacion ?? null,
        areaDesempeno: o.areaDesempeno?.nomDesempeno ?? o.nomDesempeno ?? null,
        fechaRegistro: this.fechaAIso(o.fechaRegistro),
        fechaInactividad: this.fechaAIso(o.fechaInactivacion),
        trazabilidad: o.trazabilidad ?? null,
        funciones,
        denominaciones,
        habilidades,
        conocimientos,
        ocupacionesRelacionadas,
      };
    }

    const o = copia.ocupacion;
    // CUOC guarda la función como un entero suelto ("7") y la denominación
    // como "<copia>.NNN", sin letra: se muestran con el mismo formato que CNO.
    const funciones: FuncionSnapshotDto[] = ordenarPorSecuencia(o.funciones ?? [], (f) => f.codFuncionCuoc).map(
      (f, indice) => ({
        codigo: codigoItem('F', base.codigoOriginal, indice + 1),
        codigoInterno: f.codFuncionCuoc ?? undefined,
        descripcion: f.nomFuncionCuoc ?? undefined,
        estado: estadoDeItem(f.estado),
      }),
    );
    const denominaciones: NombreSnapshotDto[] = ordenarPorSecuencia(
      o.denominaciones ?? [],
      (d) => d.codDenominacion,
    ).map((d, indice) => ({
      codigo: codigoItem('D', base.codigoOriginal, indice + 1),
      codigoInterno: d.codDenominacion,
      nombre: d.nomDenominacion ?? undefined,
      estado: estadoDeItem(d.estado),
    }));
    const habilidades: NombreSnapshotDto[] = (o.destrezas ?? []).map((h) => ({
      codigo: h.habilidadDestreza ? String(h.habilidadDestreza.codHabDest) : undefined,
      nombre: h.nombHabDest ?? undefined,
    }));
    const conocimientos: NombreSnapshotDto[] = (o.regConocimientos ?? []).map((c) => ({
      codigo: c.conocimiento ? String(c.conocimiento.codConocimiento) : undefined,
      nombre: c.nombConocimiento ?? undefined,
    }));
    const ocupacionesRelacionadas: NombreSnapshotDto[] = (o.ocupacionesAfines ?? []).map((r) => ({
      codigo: r.codigoOcupacion ?? undefined,
      nombre: r.nombreOcupacion ?? undefined,
    }));

    return {
      ...base,
      panelOrigen: 'CUOC',
      nombre: o.nomOcupacionCuoc ?? null,
      descripcion: o.descOcupacionCuoc ?? null,
      nivelCualificacion: o.nivelCompetencia?.nombreNivel ?? null,
      codNivelCualificacion: o.nivelCompetencia?.codNivel != null ? String(o.nivelCompetencia.codNivel) : null,
      areaDesempeno: o.areaCualificacion?.descripcion ?? null,
      fechaRegistro: this.fechaAIso(o.fechaRegistro),
      fechaInactividad: this.fechaAIso(o.fechaInactivacion),
      trazabilidad: o.trazabilidad ?? null,
      funciones,
      denominaciones,
      habilidades,
      conocimientos,
      ocupacionesRelacionadas,
    };
  }

  /**
   * Regenera el snapshot plano en `pregunta` para el instrumento, con los
   * ítems de las ocupaciones indicadas (por defecto todas las que agrupa; al
   * enviar, solo las elegidas), cada uno marcado con su `cod_ocupacion`. Se
   * llama al Guardar y al Enviar a experto.
   *
   * Reemplaza la ronda vigente mientras nadie la haya respondido; si ya tiene
   * respuestas la deja intacta y escribe la siguiente (ver `rondas-snapshot`).
   * Devuelve la ronda escrita.
   *
   * Antes se armaba solo con la ocupación principal, y por eso al experto le
   * llegaba una sola aunque el analista hubiera enviado tres.
   */
  async regenerarPreguntas(
    manager: EntityManager,
    row: Instrumento,
    codigos: string[] = this.getCodigosOcupaciones(row),
  ): Promise<number> {
    const instrumentoId = row.idInstrumento;
    const ronda = await prepararRondaParaEscribir(manager, instrumentoId);

    const filas: Partial<Pregunta>[] = [];
    for (const codigo of codigos) {
      const detalle = await this.toOcupacionDto(manager, row, codigo);
      const esPrincipal = codigo === ocupacionDeItem(null, row);
      for (const item of this.itemsSnapshot(detalle, esPrincipal ? row.observacion : null)) {
        filas.push({
          ...item,
          codOcupacion: codigo,
          ronda,
          instrumento: { idInstrumento: instrumentoId } as Instrumento,
        });
      }
    }

    if (filas.length > 0) {
      await manager.insert(Pregunta, filas as Pregunta[]);
    }
    return ronda;
  }

  /**
   * Ítems del snapshot de UNA ocupación, en el orden en que se validan.
   * `observacionAnalista` es de la cabecera del instrumento: se pasa solo para
   * la principal, para que no se repita por cada ocupación.
   */
  private itemsSnapshot(
    detalle: Instrumento2DetailDto,
    observacionAnalista: string | null | undefined,
  ): Array<Pick<Pregunta, 'identificador' | 'detalle' | 'inactivo'> & { otro: string | null }> {
    const items: Array<Pick<Pregunta, 'identificador' | 'detalle' | 'inactivo'> & { otro: string | null }> = [];
    const campoSimple = (identificador: string, valor: string | null | undefined, siempre = false) => {
      if (!valor && !siempre) return;
      items.push({ identificador, detalle: valor ?? '', otro: null, inactivo: false });
    };

    campoSimple('nombre', detalle.nombre);
    // Descripción y área van aunque estén vacías: son los ítems sobre los que
    // el experto deja su propuesta de texto (`pregunta_respuesta.valor_propuesto`).
    campoSimple('descripcion', detalle.descripcion, true);
    campoSimple('nivel_cualificacion', detalle.nivelCualificacion);
    campoSimple('area_desempeno', detalle.areaDesempeno, true);
    campoSimple('fecha_registro', detalle.fechaRegistro);
    campoSimple('fecha_inactividad', detalle.fechaInactividad);
    campoSimple('trazabilidad', detalle.trazabilidad);
    campoSimple('observacion', observacionAnalista);

    const itemLista = (
      identificador: string,
      lista: Array<{ codigo?: string; nombre?: string; descripcion?: string; estado?: string }>,
    ) => {
      for (const item of lista) {
        const valor = item.descripcion ?? item.nombre;
        if (!valor?.trim()) continue;
        // Funciones y denominaciones traen estado: el experto debe ver cuáles
        // estaban dadas de baja. El resto de listas no lo tiene (activo).
        items.push({ identificador, detalle: valor, otro: item.codigo ?? null, inactivo: item.estado === 'Inactivo' });
      }
    };

    itemLista('funcion', detalle.funciones);
    itemLista('denominacion', detalle.denominaciones);
    itemLista('habilidad', detalle.habilidades);
    itemLista('conocimiento', detalle.conocimientos);
    itemLista('relacionada', detalle.ocupacionesRelacionadas);

    return items;
  }

  private fechaAIso(valor: Date | string | null | undefined): string | null {
    if (!valor) return null;
    if (typeof valor === 'string') return valor;
    return valor.toISOString();
  }
}
