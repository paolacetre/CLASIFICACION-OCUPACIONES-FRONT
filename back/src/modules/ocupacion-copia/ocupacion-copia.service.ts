import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { resincronizarSecuencia, siguienteConsecutivo } from '../cno/utils/cno-secuencia.util';

import { CnoOcupacion } from '../cno/entities/cno-ocupacion.entity';
import { CnoAreaDesempeno } from '../cno/entities/cno-area-desempeno.entity';
import { CnoNivelCualificacion } from '../cno/entities/cno-nivel-cualificacion.entity';
import { CnoFuncion } from '../cno/entities/cno-funcion.entity';
import { CnoRegFunciones } from '../cno/entities/cno-reg-funciones.entity';
import { CnoDenominacion } from '../cno/entities/cno-denominacion.entity';
import { CnoRegHabilidad } from '../cno/entities/cno-reg-habilidad.entity';
import { CnoConocimiento } from '../cno/entities/cno-conocimiento.entity';
import { CnoRegConocimiento } from '../cno/entities/cno-reg-conocimiento.entity';
import { CnoRelacionada } from '../cno/entities/cno-relacionada.entity';
import { HabilidadDestreza } from '../shared/entities/habilidad-destreza.entity';
import { CuocOcupacion } from '../cuoc/entities/cuoc-ocupacion.entity';
import { CuocAreaCualificacion } from '../cuoc/entities/cuoc-area-cualificacion.entity';
import { CuocNivelCompetencia } from '../cuoc/entities/cuoc-nivel-competencia.entity';
import { CuocFuncion } from '../cuoc/entities/cuoc-funcion.entity';
import { CuocDenominacion } from '../cuoc/entities/cuoc-denominacion.entity';
import { CuocDestreza } from '../cuoc/entities/cuoc-destreza.entity';
import { CuocConocimiento } from '../cuoc/entities/cuoc-conocimiento.entity';
import { CuocRegConocimiento } from '../cuoc/entities/cuoc-reg-conocimiento.entity';
import { CuocOcupacionAfin } from '../cuoc/entities/cuoc-ocupacion-afin.entity';

/**
 * Códigos de los hijos de una copia, con el MISMO esquema organizado que usan
 * las ocupaciones del catálogo (`F-2111.01`, `D-2111.001`): después del guion
 * el código de la ocupación y después del punto el consecutivo. Antes las
 * copias llevaban uno propio (`2111-7-1-F1`, `2111-7-1-D1`) que no se parecía
 * en nada al del catálogo.
 */
const codigoFuncionDe = (codOcupacion: string, n: number) => `F-${codOcupacion}.${String(n).padStart(2, '0')}`;
const codigoDenominacionDe = (codOcupacion: string, n: number) =>
  `D-${codOcupacion}.${String(n).padStart(3, '0')}`;

export interface FuncionSnapshotInput {
  codigo?: string;
  descripcion?: string;
  /** 'Activo' | 'Inactivo' (o 1/0, true/false). Sin valor = activo. */
  estado?: string;
}

export interface NombreSnapshotInput {
  codigo?: string;
  nombre?: string;
  /** Solo lo usan las denominaciones; mismo formato que en funciones. */
  estado?: string;
}

/**
 * Forma común de los datos de un panel de ocupación, ya sea que vengan del
 * formulario de Análisis (`PanelAnalisisDto`) o de una edición hecha en
 * Instrumento 2 (`UpdateInstrumento2Dto`). Se usa por compatibilidad
 * estructural (duck typing), sin acoplar este servicio a ninguno de los dos
 * módulos que lo consumen.
 */
export interface OcupacionCopiaInput {
  nombre?: string;
  descripcion?: string;
  nivelCualificacion?: string;
  areaDesempeno?: string;
  estado?: string;
  fechaRegistro?: string;
  fechaInactividad?: string;
  trazabilidad?: string;
  funciones?: FuncionSnapshotInput[];
  denominaciones?: NombreSnapshotInput[];
  habilidades?: NombreSnapshotInput[];
  conocimientos?: NombreSnapshotInput[];
  ocupacionesRelacionadas?: NombreSnapshotInput[];
}

/**
 * Centraliza la creación, edición y borrado de las "copias propias" de
 * ocupación (CNO o CUOC) que Análisis genera al guardar y que Instrumento 2
 * edita/elimina después. Una copia tiene un código derivado
 * (ver `construirCodigoCopia`) y nunca comparte fila con el catálogo real:
 * así, editar o borrar en Instrumento 2 jamás toca los datos originales de
 * CNO/CUOC. Ver `analisis.service.ts` (creación) e
 * `instrumento2.service.ts` (edición/borrado), ambos consumidores de este
 * servicio.
 */
@Injectable()
export class OcupacionCopiaService {
  private readonly logger = new Logger(OcupacionCopiaService.name);

  /**
   * Código de una copia: `${original}-${comparativaCodigo}-${indicePanel}`.
   *
   * `comparativaCodigo` es un serial que Postgres nunca repite e
   * `indicePanel` distingue los hasta 3 paneles de una misma comparativa, así
   * que el código es único incluso cuando dos paneles arrastran la MISMA
   * ocupación de origen. Todo lo que la copia genera (funciones,
   * denominaciones, área, nivel…) cuelga de este valor, de modo que esa
   * unicidad se propaga sola a las tablas hijas.
   */
  construirCodigoCopia(codOcupacionOriginal: string, comparativaCodigo: number, indicePanel: number): string {
    return `${codOcupacionOriginal}-${comparativaCodigo}-${indicePanel}`;
  }

  /**
   * Inversa de `construirCodigoCopia`: devuelve el código de la ocupación REAL
   * del catálogo a partir del código de su copia.
   *
   * No adivina el formato recortando dígitos: usa el `comparativaCodigo` que la
   * propia fila de la copia guarda en `id_comparativa`, así que el corte es
   * exacto. Acepta las dos formas que existen en base de datos —la actual
   * `original-comparativa-indicePanel` y la previa `original-comparativa`—
   * igual que `esCodigoCopiaDe`.
   *
   * Si `codigo` no es una copia de esa comparativa se devuelve tal cual: hay
   * comparativas antiguas cuyos slots guardan directamente el código original.
   */
  extraerCodigoOriginal(codigo: string, comparativaCodigo: number | null | undefined): string {
    if (!codigo || comparativaCodigo === null || comparativaCodigo === undefined) return codigo;

    const sufijo = `-${comparativaCodigo}`;

    // Primero el formato actual `original-comparativa-indicePanel`: si se
    // probara antes el previo, una copia cuyo panel coincide con el número
    // de la comparativa ("1123-3-3") perdía solo el panel y quedaba "1123-3".
    const ultimoGuion = codigo.lastIndexOf('-');
    if (ultimoGuion > 0) {
      const indicePanel = codigo.slice(ultimoGuion + 1);
      const sinIndice = codigo.slice(0, ultimoGuion);
      if (/^[0-9]+$/.test(indicePanel) && sinIndice.endsWith(sufijo)) {
        return sinIndice.slice(0, -sufijo.length);
      }
    }

    if (codigo.endsWith(sufijo)) {
      return codigo.slice(0, -sufijo.length);
    }

    return codigo;
  }

  /**
   * Impide que una ruta de edición caiga sobre una ocupación REAL del catálogo.
   *
   * Hasta ahora la protección era por convención: quien llamaba se encargaba de
   * pasar siempre el código de la copia. Bastaba un `codigoOcupacion` mal
   * formado en el cuerpo de un PATCH para reescribir la ocupación oficial de
   * CNO/CUOC, sin ninguna traza. Una copia siempre lleva `id_comparativa`; una
   * ocupación del catálogo, nunca. Ese es el discriminante.
   */
  private assertEsCopia(
    ocupacion: { idComparativa?: number | null } | null,
    codOcupacion: string,
    catalogo: 'CNO' | 'CUOC',
  ): void {
    if (!ocupacion) return;

    if (ocupacion.idComparativa === null || ocupacion.idComparativa === undefined) {
      throw new ConflictException(
        `"${codOcupacion}" es una ocupación original de ${catalogo} y no admite cambios desde Análisis. ` +
          'Las ediciones deben hacerse sobre la copia del análisis, no sobre el catálogo.',
      );
    }
  }

  /**
   * Trazabilidad de una copia: de qué ocupación del catálogo salió.
   *
   * Si el panel trae una trazabilidad escrita por el analista, manda esa. Si no,
   * se deja constancia del origen en vez de arrastrar en silencio la del
   * catálogo, que hablaba de la ocupación original y no de esta versión.
   */
  private trazabilidadDeCopia(
    trazabilidadPanel: string | undefined,
    trazabilidadOrigen: string | null,
    codOcupacionOriginal: string,
    catalogo: 'CNO' | 'CUOC',
  ): string {
    const propia = trazabilidadPanel?.trim();
    if (propia) return propia;

    const procedencia = `Creada a partir de la ocupación ${catalogo} ${codOcupacionOriginal} desde el módulo Análisis.`;
    const heredada = trazabilidadOrigen?.trim();
    return heredada ? `${procedencia} Trazabilidad del original: ${heredada}` : procedencia;
  }

  /**
   * ¿`codigo` es una copia generada para esa comparativa? Se usa como guarda
   * antes de borrar: los slots `cod_ocupacion_cno2/3` y `cod_ocupacion_cuoc2/3`
   * de comparativas antiguas podían guardar el código ORIGINAL, y ese apunta a
   * una ocupación real del catálogo que jamás debe eliminarse. Acepta también
   * el formato previo sin `indicePanel`, cuando solo se copiaba un panel.
   */
  esCodigoCopiaDe(codigo: string, comparativaCodigo: number): boolean {
    const sufijoComparativa = `-${comparativaCodigo}`;
    if (codigo.endsWith(sufijoComparativa)) return true;

    const ultimoGuion = codigo.lastIndexOf('-');
    if (ultimoGuion <= 0) return false;
    const indicePanel = codigo.slice(ultimoGuion + 1);
    return /^[0-9]+$/.test(indicePanel) && codigo.slice(0, ultimoGuion).endsWith(sufijoComparativa);
  }

  // ============================================================
  // CNO — crear copia completa
  // ============================================================

  async copiarOcupacionCno(
    qr: QueryRunner,
    panel: OcupacionCopiaInput,
    codOcupacionOriginal: string,
    comparativaCodigo: number,
    indicePanel: number,
  ): Promise<string> {
    const nuevoCodOcupacion = this.construirCodigoCopia(codOcupacionOriginal, comparativaCodigo, indicePanel);

    const origen = await qr.manager.findOne(CnoOcupacion, {
      where: { codOcupacionCno: codOcupacionOriginal },
      relations: ['areaDesempeno', 'nivelCualificacion'],
    });

    const areaDesempeno = await this.resolverAreaDesempeno(
      qr,
      panel.areaDesempeno,
      origen?.areaDesempeno ?? null,
      codOcupacionOriginal,
    );
    const nivelCualificacion = await this.resolverNivelCualificacion(
      qr,
      panel.nivelCualificacion,
      origen?.nivelCualificacion ?? null,
      codOcupacionOriginal,
    );

    const nuevaOcupacion = qr.manager.create(CnoOcupacion, {
      codOcupacionCno: nuevoCodOcupacion,
      nombOcupacionCno: panel.nombre?.trim() || origen?.nombOcupacionCno || '',
      descripcion: panel.descripcion?.trim() || origen?.descripcion || '',
      nomDesempeno: areaDesempeno.nomDesempeno,
      nivelesCualificacion: nivelCualificacion.nivelesCualificacion,
      estado: this.parseEstado(panel.estado) ?? origen?.estado ?? true,
      // Las fechas son del CICLO DE VIDA de la ocupacion en el catalogo, no del
      // analisis: la copia hereda las del original y solo las pisa si el panel
      // manda un valor. Analisis ya no las expone para editar, asi que en la
      // practica siempre se heredan. Antes `fechaRegistro` caia en `new Date()`
      // en cuanto el panel no la mandaba, y la copia nacia fechada hoy: la
      // ocupacion parecia dada de alta el dia del analisis.
      fechaInactivacion: this.parseDate(panel.fechaInactividad) ?? origen?.fechaInactivacion ?? null,
      fechaRegistro: this.parseDate(panel.fechaRegistro) ?? origen?.fechaRegistro ?? new Date(),
      trazabilidad: this.trazabilidadDeCopia(
        panel.trazabilidad,
        origen?.trazabilidad ?? null,
        codOcupacionOriginal,
        'CNO',
      ),
      // Marca de copia. Sin esto la fila era indistinguible de una ocupación
      // real del catálogo: había que adivinarlo por el guion del código, y
      // nada impedía que una edición cayera sobre el original. Es también el
      // vínculo con el análisis que la creó.
      idComparativa: comparativaCodigo,
      areaDesempeno: { codDesempeno: areaDesempeno.codDesempeno } as CnoAreaDesempeno,
      nivelCualificacion: { codCualificacion: nivelCualificacion.codCualificacion } as CnoNivelCualificacion,
    });
    await qr.manager.save(CnoOcupacion, nuevaOcupacion);

    await this.copiarFuncionesCno(qr, nuevoCodOcupacion, panel.funciones ?? []);
    await this.copiarDenominacionesCno(qr, nuevoCodOcupacion, panel.denominaciones ?? []);
    await this.copiarHabilidadesCno(qr, nuevoCodOcupacion, panel.habilidades ?? []);
    await this.copiarConocimientosCno(qr, nuevoCodOcupacion, panel.conocimientos ?? []);
    await this.copiarRelacionadasCno(qr, nuevoCodOcupacion, panel.ocupacionesRelacionadas ?? []);

    return nuevoCodOcupacion;
  }

  private async resolverAreaDesempeno(
    qr: QueryRunner,
    etiquetaPanel: string | undefined,
    origen: CnoAreaDesempeno | null,
    codOcupacionOriginal: string,
  ): Promise<CnoAreaDesempeno> {
    const etiqueta = etiquetaPanel?.trim();

    if (etiqueta && origen && origen.nomDesempeno?.trim().toLowerCase() === etiqueta.toLowerCase()) {
      return origen;
    }
    if (etiqueta) {
      const existente = await qr.manager.findOne(CnoAreaDesempeno, { where: { nomDesempeno: etiqueta } });
      if (existente) return existente;
    }
    // La etiqueta del panel no corresponde a ningun area del catalogo: se conserva la
    // del origen. Ver nota en resolverNivelCualificacion.
    if (origen) {
      if (etiqueta) {
        this.logger.warn(
          `Copia de '${codOcupacionOriginal}': area de desempeno '${etiqueta}' no existe en ` +
            `cno_area_desempeno; se mantiene la del origen ('${origen.nomDesempeno}').`,
        );
      }
      return origen;
    }

    throw new BadRequestException(
      `No se puede copiar la ocupacion '${codOcupacionOriginal}': no tiene area de desempeno ` +
        `en cno_area_desempeno y cod_desempeno_cno es obligatorio.`,
    );
  }

  private async resolverNivelCualificacion(
    qr: QueryRunner,
    etiquetaPanel: string | undefined,
    origen: CnoNivelCualificacion | null,
    codOcupacionOriginal: string,
  ): Promise<CnoNivelCualificacion> {
    const etiqueta = etiquetaPanel?.trim();

    if (
      etiqueta &&
      origen &&
      origen.nivelesCualificacion?.trim().toLowerCase() === etiqueta.toLowerCase()
    ) {
      return origen;
    }
    if (etiqueta) {
      // Incluye las copias de nivel creadas en Actualización; ante empate, el oficial.
      const existente = await qr.manager.findOne(CnoNivelCualificacion, {
        where: { nivelesCualificacion: etiqueta },
        order: { esCopia: 'ASC' },
      });
      if (existente) return existente;
    }
    // Area de desempeno y nivel de cualificacion son catalogos cerrados: los 10 valores
    // de cada uno vienen del cargue oficial y el analista no los inventa desde Analisis.
    // Antes, una etiqueta que no calzaba con el catalogo creaba una fila nueva con codigo
    // sintetico ('<codigo>-NC'), asi que cualquier diferencia de texto en el panel —por
    // ejemplo el nivel que llegaba recortado a 15 caracteres— ensuciaba el catalogo de
    // forma permanente. Ahora la copia simplemente reutiliza la fila del origen.
    if (origen) {
      if (etiqueta) {
        this.logger.warn(
          `Copia de '${codOcupacionOriginal}': nivel de cualificacion '${etiqueta}' no existe en ` +
            `cno_nivel_cualificacion; se mantiene el del origen ('${origen.nivelesCualificacion}').`,
        );
      }
      return origen;
    }

    throw new BadRequestException(
      `No se puede copiar la ocupacion '${codOcupacionOriginal}': no tiene nivel de cualificacion ` +
        `en cno_nivel_cualificacion y cod_cualificacion_cno es obligatorio.`,
    );
  }

  async copiarFuncionesCno(
    qr: QueryRunner,
    nuevoCodOcupacion: string,
    funciones: FuncionSnapshotInput[],
  ): Promise<void> {
    let indice = 0;
    for (const fn of funciones) {
      const descripcion = fn.descripcion?.trim();
      if (!descripcion) continue;
      indice += 1;

      let funcionCatalogo: CnoFuncion | null = null;
      const codigoOriginal = fn.codigo?.trim();

      if (codigoOriginal) {
        funcionCatalogo = await qr.manager.findOne(CnoFuncion, { where: { codFuncion: codigoOriginal } });
      }
      if (!funcionCatalogo) {
        funcionCatalogo = await qr.manager.findOne(CnoFuncion, { where: { descFuncionCno: descripcion } });
      }
      if (!funcionCatalogo) {
        // Función creada desde cero: entra al catálogo con el siguiente F-NNN,
        // igual que las que se crean desde el módulo de catálogo
        // (`CnoFuncionesService.generarCodigoCatalogo`).
        funcionCatalogo = qr.manager.create(CnoFuncion, {
          codFuncion: codigoOriginal || (await this.siguienteCodigoFuncionCatalogo(qr)),
          descFuncionCno: descripcion,
        });
        funcionCatalogo = await qr.manager.save(CnoFuncion, funcionCatalogo);
      }

      const regFuncion = qr.manager.create(CnoRegFunciones, {
        codigo: codigoFuncionDe(nuevoCodOcupacion, indice),
        descFuncionCno: descripcion,
        estado: this.estadoItem(fn.estado),
        ocupacion: { codOcupacionCno: nuevoCodOcupacion } as CnoOcupacion,
        funcion: funcionCatalogo,
      });
      await qr.manager.save(CnoRegFunciones, regFuncion);
    }
  }

  async copiarDenominacionesCno(
    qr: QueryRunner,
    nuevoCodOcupacion: string,
    denominaciones: NombreSnapshotInput[],
  ): Promise<void> {
    let indice = 0;
    for (const denom of denominaciones) {
      const nombre = denom.nombre?.trim();
      if (!nombre) continue;
      indice += 1;

      const nueva = qr.manager.create(CnoDenominacion, {
        codDenominacionCno: codigoDenominacionDe(nuevoCodOcupacion, indice),
        descDenominacion: nombre,
        estado: this.estadoItem(denom.estado),
        fechaReg: new Date(),
        fechaInactivacion: this.estadoItem(denom.estado) === 0 ? new Date() : undefined,
        ocupacion: { codOcupacionCno: nuevoCodOcupacion } as CnoOcupacion,
      });
      await qr.manager.save(CnoDenominacion, nueva);
    }
  }

  async copiarHabilidadesCno(
    qr: QueryRunner,
    nuevoCodOcupacion: string,
    habilidades: NombreSnapshotInput[],
  ): Promise<void> {
    for (const hab of habilidades) {
      const nombre = hab.nombre?.trim();
      if (!nombre) continue;

      const catalogo = await this.resolverHabilidadDestreza(qr, nombre);

      const reg = qr.manager.create(CnoRegHabilidad, {
        nombHabDest: nombre,
        habilidadDestreza: catalogo,
        ocupacion: { codOcupacionCno: nuevoCodOcupacion } as CnoOcupacion,
      });
      await qr.manager.save(CnoRegHabilidad, reg);
    }
  }

  async copiarConocimientosCno(
    qr: QueryRunner,
    nuevoCodOcupacion: string,
    conocimientos: NombreSnapshotInput[],
  ): Promise<void> {
    for (const con of conocimientos) {
      const nombre = con.nombre?.trim();
      if (!nombre) continue;

      let catalogo = await qr.manager.findOne(CnoConocimiento, { where: { nombConocimiento: nombre } });
      if (!catalogo) {
        // El código se calcula a mano (igual que en cuoc_conocimiento, ver
        // siguienteEnteroLibre) y después se reposiciona la secuencia SERIAL, que
        // un INSERT con código explícito no avanza.
        const siguienteId = await this.siguienteEnteroLibre(qr, 'cno_conocimiento', 'cod_conocimiento');
        catalogo = qr.manager.create(CnoConocimiento, {
          codConocimiento: siguienteId,
          nombConocimiento: nombre,
          descConocimiento: nombre,
        });
        catalogo = await qr.manager.save(CnoConocimiento, catalogo);
        await resincronizarSecuencia(qr.manager, 'cno_conocimiento', 'cod_conocimiento');
      }

      const reg = qr.manager.create(CnoRegConocimiento, {
        nombConocimiento: nombre,
        conocimiento: catalogo,
        ocupacion: { codOcupacionCno: nuevoCodOcupacion } as CnoOcupacion,
      });
      await qr.manager.save(CnoRegConocimiento, reg);
    }
  }

  /**
   * @param nombreOrigen Nombre de la ocupación DUEÑA de las relacionadas, que es
   *   lo que guarda nombre_ocupacion (así viene del cargue). Sin él se conserva
   *   el comportamiento de las copias de Análisis.
   */
  async copiarRelacionadasCno(
    qr: QueryRunner,
    nuevoCodOcupacion: string,
    relacionadas: NombreSnapshotInput[],
    nombreOrigen?: string,
  ): Promise<void> {
    for (const rel of relacionadas) {
      const codigo = rel.codigo?.trim();
      const nombre = rel.nombre?.trim();
      if (!codigo && !nombre) continue;

      const nueva = qr.manager.create(CnoRelacionada, {
        nombreOcupacion: nombreOrigen ?? nombre ?? '',
        codigoOcupacion: codigo ?? '',
        nombreCnoRelacionada: nombre ?? '',
        ocupacion: { codOcupacionCno: nuevoCodOcupacion } as CnoOcupacion,
      });
      await qr.manager.save(CnoRelacionada, nueva);
    }
  }

  // ============================================================
  // CUOC — crear copia completa
  // ============================================================

  async copiarOcupacionCuoc(
    qr: QueryRunner,
    panel: OcupacionCopiaInput,
    codOcupacionOriginal: string,
    comparativaCodigo: number,
    indicePanel: number,
  ): Promise<string> {
    const nuevoCodOcupacion = this.construirCodigoCopia(codOcupacionOriginal, comparativaCodigo, indicePanel);

    const origen = await qr.manager.findOne(CuocOcupacion, {
      where: { codOcupacionCuoc: codOcupacionOriginal },
      relations: ['grupoPrimario', 'nivelCompetencia', 'areaCualificacion'],
    });

    // cod_grupo_prim es NOT NULL en cuoc_ocupacion y no tiene campo equivalente
    // en el panel del formulario: se reutiliza el mismo grupo primario del
    // origen (es taxonomía estable, no algo que el analista edite aquí).
    const grupoPrimario = origen?.grupoPrimario ?? null;

    const areaCualificacion = await this.resolverAreaCualificacion(
      qr,
      panel.areaDesempeno,
      origen?.areaCualificacion ?? null,
      codOcupacionOriginal,
    );
    const nivelCompetencia = await this.resolverNivelCompetencia(
      qr,
      panel.nivelCualificacion,
      origen?.nivelCompetencia ?? null,
      codOcupacionOriginal,
    );

    const nuevaOcupacion = qr.manager.create(CuocOcupacion, {
      codOcupacionCuoc: nuevoCodOcupacion,
      nomOcupacionCuoc: panel.nombre?.trim() || origen?.nomOcupacionCuoc || '',
      descOcupacionCuoc: panel.descripcion?.trim() || origen?.descOcupacionCuoc || '',
      estado: this.parseEstado(panel.estado) ?? origen?.estado ?? true,
      // Mismo criterio que en CNO: las fechas se heredan del original.
      fechaInactivacion: this.parseDate(panel.fechaInactividad) ?? origen?.fechaInactivacion ?? null,
      fechaRegistro: this.parseDate(panel.fechaRegistro) ?? origen?.fechaRegistro ?? new Date(),
      trazabilidad: this.trazabilidadDeCopia(
        panel.trazabilidad,
        origen?.trazabilidad ?? null,
        codOcupacionOriginal,
        'CUOC',
      ),
      // Misma marca de copia que en CNO: ver el comentario de copiarOcupacionCno.
      idComparativa: comparativaCodigo,
      grupoPrimario: grupoPrimario ? ({ codGrupoPrim: grupoPrimario.codGrupoPrim } as any) : undefined,
      areaCualificacion: { codigo: areaCualificacion.codigo } as CuocAreaCualificacion,
      nivelCompetencia: { codNivel: nivelCompetencia.codNivel } as CuocNivelCompetencia,
    });
    await qr.manager.save(CuocOcupacion, nuevaOcupacion);

    await this.copiarFuncionesCuoc(qr, nuevoCodOcupacion, panel.funciones ?? []);
    await this.copiarDenominacionesCuoc(qr, nuevoCodOcupacion, panel.denominaciones ?? []);
    await this.copiarHabilidadesCuoc(qr, nuevoCodOcupacion, panel.habilidades ?? []);
    await this.copiarConocimientosCuoc(qr, nuevoCodOcupacion, panel.conocimientos ?? []);
    await this.copiarRelacionadasCuoc(qr, nuevoCodOcupacion, panel.ocupacionesRelacionadas ?? []);

    return nuevoCodOcupacion;
  }

  private async resolverAreaCualificacion(
    qr: QueryRunner,
    etiquetaPanel: string | undefined,
    origen: CuocAreaCualificacion | null,
    codOcupacionOriginal: string,
  ): Promise<CuocAreaCualificacion> {
    // cuoc_area_cualificacion solo tiene `descripcion` (no un campo "nombre"
    // separado como CNO), así que la comparación de etiqueta se hace contra ella.
    const etiqueta = etiquetaPanel?.trim();

    if (etiqueta && origen && origen.descripcion?.trim().toLowerCase() === etiqueta.toLowerCase()) {
      return origen;
    }
    if (etiqueta) {
      const existente = await qr.manager.findOne(CuocAreaCualificacion, { where: { descripcion: etiqueta } });
      if (existente) return existente;
    }
    // Catalogo cerrado, igual que en CNO: nunca se crea una fila nueva desde Analisis.
    if (origen) {
      if (etiqueta) {
        this.logger.warn(
          `Copia de '${codOcupacionOriginal}': area de cualificacion '${etiqueta}' no existe en ` +
            `cuoc_area_cualificacion; se mantiene la del origen ('${origen.descripcion}').`,
        );
      }
      return origen;
    }

    throw new BadRequestException(
      `No se puede copiar la ocupacion '${codOcupacionOriginal}': no tiene area de cualificacion ` +
        `en cuoc_area_cualificacion y es obligatoria.`,
    );
  }

  private async resolverNivelCompetencia(
    qr: QueryRunner,
    etiquetaPanel: string | undefined,
    origen: CuocNivelCompetencia | null,
    codOcupacionOriginal: string,
  ): Promise<CuocNivelCompetencia> {
    const etiqueta = etiquetaPanel?.trim();

    if (etiqueta && origen && origen.nombreNivel?.trim().toLowerCase() === etiqueta.toLowerCase()) {
      return origen;
    }
    if (etiqueta) {
      // Incluye las copias de nivel creadas en Actualización; ante empate, el oficial.
      const existente = await qr.manager.findOne(CuocNivelCompetencia, {
        where: { nombreNivel: etiqueta },
        order: { esCopia: 'ASC' },
      });
      if (existente) return existente;
    }
    // Catalogo cerrado, igual que en CNO: nunca se crea una fila nueva desde Analisis.
    if (origen) {
      if (etiqueta) {
        this.logger.warn(
          `Copia de '${codOcupacionOriginal}': nivel de competencia '${etiqueta}' no existe en ` +
            `cuoc_nivel_competencia; se mantiene el del origen ('${origen.nombreNivel}').`,
        );
      }
      return origen;
    }

    throw new BadRequestException(
      `No se puede copiar la ocupacion '${codOcupacionOriginal}': no tiene nivel de competencia ` +
        `en cuoc_nivel_competencia y es obligatorio.`,
    );
  }

  async copiarFuncionesCuoc(
    qr: QueryRunner,
    nuevoCodOcupacion: string,
    funciones: FuncionSnapshotInput[],
  ): Promise<void> {
    // cuoc_funciones no tiene catálogo separado (a diferencia de cno_funcion +
    // cno_reg_funciones): se inserta directo, un paso. Una función que ya traía
    // código lo conserva; una creada desde cero recibe el organizado.
    let indice = 0;
    for (const fn of funciones) {
      const descripcion = fn.descripcion?.trim();
      if (!descripcion) continue;
      indice += 1;

      const nueva = qr.manager.create(CuocFuncion, {
        codFuncionCuoc: fn.codigo?.trim() || codigoFuncionDe(nuevoCodOcupacion, indice),
        nomFuncionCuoc: descripcion,
        fechaRegistro: new Date(),
        estado: this.estadoItem(fn.estado),
        fechaInactivo: this.estadoItem(fn.estado) === 0 ? new Date() : undefined,
        ocupacion: { codOcupacionCuoc: nuevoCodOcupacion } as CuocOcupacion,
      });
      await qr.manager.save(CuocFuncion, nueva);
    }
  }

  async copiarDenominacionesCuoc(
    qr: QueryRunner,
    nuevoCodOcupacion: string,
    denominaciones: NombreSnapshotInput[],
  ): Promise<void> {
    let indice = 0;
    for (const denom of denominaciones) {
      const nombre = denom.nombre?.trim();
      if (!nombre) continue;
      indice += 1;

      const nueva = qr.manager.create(CuocDenominacion, {
        codDenominacion: codigoDenominacionDe(nuevoCodOcupacion, indice),
        nomDenominacion: nombre,
        estado: this.estadoItem(denom.estado),
        fechaRegistro: new Date(),
        ocupacion: { codOcupacionCuoc: nuevoCodOcupacion } as CuocOcupacion,
      });
      await qr.manager.save(CuocDenominacion, nueva);
    }
  }

  async copiarHabilidadesCuoc(
    qr: QueryRunner,
    nuevoCodOcupacion: string,
    habilidades: NombreSnapshotInput[],
  ): Promise<void> {
    for (const hab of habilidades) {
      const nombre = hab.nombre?.trim();
      if (!nombre) continue;

      const catalogo = await this.resolverHabilidadDestreza(qr, nombre);

      const reg = qr.manager.create(CuocDestreza, {
        nombHabDest: nombre,
        habilidadDestreza: catalogo,
        ocupacion: { codOcupacionCuoc: nuevoCodOcupacion } as CuocOcupacion,
      });
      await qr.manager.save(CuocDestreza, reg);
    }
  }

  async copiarConocimientosCuoc(
    qr: QueryRunner,
    nuevoCodOcupacion: string,
    conocimientos: NombreSnapshotInput[],
  ): Promise<void> {
    for (const con of conocimientos) {
      const nombre = con.nombre?.trim();
      if (!nombre) continue;

      let catalogo = await qr.manager.findOne(CuocConocimiento, { where: { nombConocimiento: nombre } });
      if (!catalogo) {
        // A diferencia de cno_conocimiento, cuoc_conocimiento.cod_conocimiento
        // NO es SERIAL: hay que mintar el id explícitamente.
        const siguienteId = await this.siguienteEnteroLibre(qr, 'cuoc_conocimiento', 'cod_conocimiento');
        catalogo = qr.manager.create(CuocConocimiento, {
          codConocimiento: siguienteId,
          nombConocimiento: nombre,
          descConocimiento: nombre,
        });
        catalogo = await qr.manager.save(CuocConocimiento, catalogo);
      }

      const reg = qr.manager.create(CuocRegConocimiento, {
        nombConocimiento: nombre,
        conocimiento: catalogo,
        ocupacion: { codOcupacionCuoc: nuevoCodOcupacion } as CuocOcupacion,
      });
      await qr.manager.save(CuocRegConocimiento, reg);
    }
  }

  /**
   * @param nombreOrigen Nombre de la ocupación DUEÑA de las relacionadas, que es
   *   lo que guarda nombre_ocupacion (así viene del cargue). Sin él se conserva
   *   el comportamiento de las copias de Análisis.
   */
  async copiarRelacionadasCuoc(
    qr: QueryRunner,
    nuevoCodOcupacion: string,
    relacionadas: NombreSnapshotInput[],
    nombreOrigen?: string,
  ): Promise<void> {
    for (const rel of relacionadas) {
      const codigo = rel.codigo?.trim();
      const nombre = rel.nombre?.trim();
      if (!codigo && !nombre) continue;

      const nueva = qr.manager.create(CuocOcupacionAfin, {
        nombreOcupacion: nombreOrigen ?? nombre ?? '',
        codigoOcupacion: codigo ?? '',
        nombreCnoAfin: nombre ?? '',
        ocupacion: { codOcupacionCuoc: nuevoCodOcupacion } as CuocOcupacion,
      });
      await qr.manager.save(CuocOcupacionAfin, nueva);
    }
  }

  // ============================================================
  // Catálogo compartido CNO/CUOC
  // ============================================================

  /**
   * Siguiente código `F-NNN` del catálogo `cno_funcion`. Misma consulta y mismo
   * lock que `CnoFuncionesService.generarCodigoCatalogo`, para que una función
   * creada desde Análisis y otra creada a la vez desde el catálogo no choquen.
   */
  private async siguienteCodigoFuncionCatalogo(qr: QueryRunner): Promise<string> {
    const next = await siguienteConsecutivo(
      qr.manager,
      'cno_funcion',
      `SELECT COALESCE(MAX(CAST(SUBSTRING(cod_funcion FROM 'F-(\\d+)') AS INT)), 0) + 1 AS next FROM cno_funcion`,
      [],
    );
    return `F-${String(next).padStart(3, '0')}`;
  }

  private async resolverHabilidadDestreza(qr: QueryRunner, nombre: string): Promise<HabilidadDestreza> {
    let catalogo = await qr.manager.findOne(HabilidadDestreza, { where: { nombHabDest: nombre } });
    if (!catalogo) {
      // Mismo caso que cno_conocimiento: código calculado a mano y secuencia
      // reposicionada después.
      const nuevoId = await this.siguienteEnteroLibre(qr, 'habilidad_destreza', 'cod_hab_dest');
      catalogo = qr.manager.create(HabilidadDestreza, {
        codHabDest: nuevoId,
        nombHabDest: nombre,
        descHabDest: nombre,
      });
      catalogo = await qr.manager.save(HabilidadDestreza, catalogo);
      await resincronizarSecuencia(qr.manager, 'habilidad_destreza', 'cod_hab_dest');
    }
    return catalogo;
  }

  // ============================================================
  // Editar una copia existente (usado por Instrumento2Service.update)
  // ============================================================

  async actualizarOcupacionCno(qr: QueryRunner, codOcupacion: string, cambios: OcupacionCopiaInput): Promise<void> {
    const ocupacion = await qr.manager.findOne(CnoOcupacion, {
      where: { codOcupacionCno: codOcupacion },
      relations: ['areaDesempeno', 'nivelCualificacion'],
    });
    if (!ocupacion) return;
    this.assertEsCopia(ocupacion, codOcupacion, 'CNO');
    await this.aplicarCamposCno(qr, ocupacion, codOcupacion, cambios);
    await qr.manager.save(CnoOcupacion, ocupacion);
  }

  /** Campos propios de una ocupación CNO (copia u original); no guarda. */
  private async aplicarCamposCno(
    qr: QueryRunner,
    ocupacion: CnoOcupacion,
    codOcupacion: string,
    cambios: OcupacionCopiaInput,
  ): Promise<void> {
    if (cambios.nombre !== undefined) ocupacion.nombOcupacionCno = cambios.nombre;
    if (cambios.descripcion !== undefined) ocupacion.descripcion = cambios.descripcion;
    // Solo se toca la fecha de alta si llega una fecha VALIDA. Una copia siempre
    // tiene fecha de registro, asi que un '' (o una cadena no parseable) es un
    // campo que el formulario no edita, no una orden de borrarla; tratarlo como
    // borrado dejaba la fecha en NULL en cada PATCH. La de inactivacion si se
    // limpia con '': ahi vaciar es una edicion legitima.
    const fechaRegistroNueva = this.parseDate(cambios.fechaRegistro);
    if (fechaRegistroNueva) ocupacion.fechaRegistro = fechaRegistroNueva;
    if (cambios.fechaInactividad !== undefined) ocupacion.fechaInactivacion = this.parseDate(cambios.fechaInactividad);
    if (cambios.trazabilidad !== undefined) ocupacion.trazabilidad = cambios.trazabilidad || null;

    if (cambios.areaDesempeno !== undefined) {
      const area = await this.resolverAreaDesempeno(qr, cambios.areaDesempeno, ocupacion.areaDesempeno, codOcupacion);
      ocupacion.areaDesempeno = { codDesempeno: area.codDesempeno } as CnoAreaDesempeno;
      ocupacion.nomDesempeno = area.nomDesempeno;
    }
    if (cambios.nivelCualificacion !== undefined) {
      const nivel = await this.resolverNivelCualificacion(
        qr,
        cambios.nivelCualificacion,
        ocupacion.nivelCualificacion,
        codOcupacion,
      );
      ocupacion.nivelCualificacion = { codCualificacion: nivel.codCualificacion } as CnoNivelCualificacion;
      ocupacion.nivelesCualificacion = nivel.nivelesCualificacion;
    }
  }

  async actualizarOcupacionCuoc(qr: QueryRunner, codOcupacion: string, cambios: OcupacionCopiaInput): Promise<void> {
    const ocupacion = await qr.manager.findOne(CuocOcupacion, {
      where: { codOcupacionCuoc: codOcupacion },
      relations: ['areaCualificacion', 'nivelCompetencia'],
    });
    if (!ocupacion) return;
    this.assertEsCopia(ocupacion, codOcupacion, 'CUOC');
    await this.aplicarCamposCuoc(qr, ocupacion, codOcupacion, cambios);
    await qr.manager.save(CuocOcupacion, ocupacion);
  }

  /** Campos propios de una ocupación CUOC (copia u original); no guarda. */
  private async aplicarCamposCuoc(
    qr: QueryRunner,
    ocupacion: CuocOcupacion,
    codOcupacion: string,
    cambios: OcupacionCopiaInput,
  ): Promise<void> {
    if (cambios.nombre !== undefined) ocupacion.nomOcupacionCuoc = cambios.nombre;
    if (cambios.descripcion !== undefined) ocupacion.descOcupacionCuoc = cambios.descripcion;
    // Solo se toca la fecha de alta si llega una fecha VALIDA. Una copia siempre
    // tiene fecha de registro, asi que un '' (o una cadena no parseable) es un
    // campo que el formulario no edita, no una orden de borrarla; tratarlo como
    // borrado dejaba la fecha en NULL en cada PATCH. La de inactivacion si se
    // limpia con '': ahi vaciar es una edicion legitima.
    const fechaRegistroNueva = this.parseDate(cambios.fechaRegistro);
    if (fechaRegistroNueva) ocupacion.fechaRegistro = fechaRegistroNueva;
    if (cambios.fechaInactividad !== undefined) ocupacion.fechaInactivacion = this.parseDate(cambios.fechaInactividad);
    if (cambios.trazabilidad !== undefined) ocupacion.trazabilidad = cambios.trazabilidad || null;

    if (cambios.areaDesempeno !== undefined) {
      const area = await this.resolverAreaCualificacion(
        qr,
        cambios.areaDesempeno,
        ocupacion.areaCualificacion,
        codOcupacion,
      );
      ocupacion.areaCualificacion = { codigo: area.codigo } as CuocAreaCualificacion;
    }
    if (cambios.nivelCualificacion !== undefined) {
      const nivel = await this.resolverNivelCompetencia(
        qr,
        cambios.nivelCualificacion,
        ocupacion.nivelCompetencia,
        codOcupacion,
      );
      ocupacion.nivelCompetencia = { codNivel: nivel.codNivel } as CuocNivelCompetencia;
    }
  }

  /** Reemplaza por completo funciones/denominaciones/habilidades/conocimientos/relacionadas de una copia CNO. */
  async reemplazarHijosCno(qr: QueryRunner, codOcupacion: string, datos: OcupacionCopiaInput): Promise<void> {
    await this.borrarHijosPorRelacion(qr, CnoRegFunciones, codOcupacion, 'codOcupacionCno');
    await this.borrarHijosPorRelacion(qr, CnoDenominacion, codOcupacion, 'codOcupacionCno');
    await this.borrarHijosPorRelacion(qr, CnoRegHabilidad, codOcupacion, 'codOcupacionCno');
    await this.borrarHijosPorRelacion(qr, CnoRegConocimiento, codOcupacion, 'codOcupacionCno');
    await this.borrarHijosPorRelacion(qr, CnoRelacionada, codOcupacion, 'codOcupacionCno');

    await this.copiarFuncionesCno(qr, codOcupacion, datos.funciones ?? []);
    await this.copiarDenominacionesCno(qr, codOcupacion, datos.denominaciones ?? []);
    await this.copiarHabilidadesCno(qr, codOcupacion, datos.habilidades ?? []);
    await this.copiarConocimientosCno(qr, codOcupacion, datos.conocimientos ?? []);
    await this.copiarRelacionadasCno(qr, codOcupacion, datos.ocupacionesRelacionadas ?? []);
  }

  /** Reemplaza por completo funciones/denominaciones/habilidades/conocimientos/relacionadas de una copia CUOC. */
  async reemplazarHijosCuoc(qr: QueryRunner, codOcupacion: string, datos: OcupacionCopiaInput): Promise<void> {
    await this.borrarHijosPorRelacion(qr, CuocFuncion, codOcupacion, 'codOcupacionCuoc');
    await this.borrarHijosPorRelacion(qr, CuocDenominacion, codOcupacion, 'codOcupacionCuoc');
    await this.borrarHijosPorRelacion(qr, CuocDestreza, codOcupacion, 'codOcupacionCuoc');
    await this.borrarHijosPorRelacion(qr, CuocRegConocimiento, codOcupacion, 'codOcupacionCuoc');
    await this.borrarHijosPorRelacion(qr, CuocOcupacionAfin, codOcupacion, 'codOcupacionCuoc');

    await this.copiarFuncionesCuoc(qr, codOcupacion, datos.funciones ?? []);
    await this.copiarDenominacionesCuoc(qr, codOcupacion, datos.denominaciones ?? []);
    await this.copiarHabilidadesCuoc(qr, codOcupacion, datos.habilidades ?? []);
    await this.copiarConocimientosCuoc(qr, codOcupacion, datos.conocimientos ?? []);
    await this.copiarRelacionadasCuoc(qr, codOcupacion, datos.ocupacionesRelacionadas ?? []);
  }

  // ============================================================
  // Actualización: editar la ocupación ORIGINAL del catálogo
  // ============================================================
  //
  // A diferencia de reemplazarHijos* (que borra y recrea, válido en copias),
  // aquí se CONSERVAN los códigos existentes: las denominaciones del catálogo
  // las referencian las correlativas. Lo que llega con un código conocido se
  // actualiza, lo nuevo se crea con el formato oficial y lo que se quitó se
  // inactiva (denominaciones y funciones) o se desvincula (habilidades,
  // conocimientos, relacionadas: son solo vínculos). Todo dentro de la
  // transacción de quien llama.

  /** Impide que Actualización escriba sobre una copia de Análisis. */
  private assertEsOriginal(
    ocupacion: { idComparativa?: number | null } | null,
    codOcupacion: string,
    catalogo: 'CNO' | 'CUOC',
  ): void {
    if (!ocupacion) {
      throw new NotFoundException(`No existe la ocupación ${catalogo} ${codOcupacion}.`);
    }
    if (ocupacion.idComparativa !== null && ocupacion.idComparativa !== undefined) {
      throw new ConflictException(
        `"${codOcupacion}" es una copia de Análisis; se edita desde Análisis, no desde Actualización.`,
      );
    }
  }

  /** Activo/inactivo con su fecha de inactivación. Solo cambia si llega un estado reconocible. */
  private aplicarEstado(ocupacion: { estado: boolean; fechaInactivacion: Date | null }, estado?: string): void {
    const activo = this.parseEstado(estado);
    if (activo === null || activo === ocupacion.estado) return;
    ocupacion.estado = activo;
    ocupacion.fechaInactivacion = activo ? null : new Date();
  }

  async actualizarOriginalCno(qr: QueryRunner, codOcupacion: string, datos: OcupacionCopiaInput): Promise<void> {
    const ocupacion = await qr.manager.findOne(CnoOcupacion, {
      where: { codOcupacionCno: codOcupacion },
      relations: ['areaDesempeno', 'nivelCualificacion'],
    });
    this.assertEsOriginal(ocupacion, codOcupacion, 'CNO');
    await this.aplicarCamposCno(qr, ocupacion!, codOcupacion, datos);
    this.aplicarEstado(ocupacion!, datos.estado);
    await qr.manager.save(CnoOcupacion, ocupacion!);

    if (datos.denominaciones) await this.sincronizarDenominacionesCno(qr, codOcupacion, datos.denominaciones);
    if (datos.funciones) await this.sincronizarFuncionesCno(qr, codOcupacion, datos.funciones);
    if (datos.habilidades) await this.sincronizarHabilidadesCno(qr, codOcupacion, datos.habilidades);
    if (datos.conocimientos) await this.sincronizarConocimientosCno(qr, codOcupacion, datos.conocimientos);
    if (datos.ocupacionesRelacionadas) {
      await this.borrarHijosPorRelacion(qr, CnoRelacionada, codOcupacion, 'codOcupacionCno');
      await this.copiarRelacionadasCno(qr, codOcupacion, datos.ocupacionesRelacionadas, ocupacion!.nombOcupacionCno);
    }
  }

  async actualizarOriginalCuoc(qr: QueryRunner, codOcupacion: string, datos: OcupacionCopiaInput): Promise<void> {
    const ocupacion = await qr.manager.findOne(CuocOcupacion, {
      where: { codOcupacionCuoc: codOcupacion },
      relations: ['areaCualificacion', 'nivelCompetencia'],
    });
    this.assertEsOriginal(ocupacion, codOcupacion, 'CUOC');
    await this.aplicarCamposCuoc(qr, ocupacion!, codOcupacion, datos);
    this.aplicarEstado(ocupacion!, datos.estado);
    await qr.manager.save(CuocOcupacion, ocupacion!);

    if (datos.denominaciones) await this.sincronizarDenominacionesCuoc(qr, codOcupacion, datos.denominaciones);
    if (datos.funciones) await this.sincronizarFuncionesCuoc(qr, codOcupacion, datos.funciones);
    if (datos.habilidades) await this.sincronizarDestrezasCuoc(qr, codOcupacion, datos.habilidades);
    if (datos.conocimientos) await this.sincronizarConocimientosCuoc(qr, codOcupacion, datos.conocimientos);
    if (datos.ocupacionesRelacionadas) {
      await this.borrarHijosPorRelacion(qr, CuocOcupacionAfin, codOcupacion, 'codOcupacionCuoc');
      await this.copiarRelacionadasCuoc(qr, codOcupacion, datos.ocupacionesRelacionadas, ocupacion!.nomOcupacionCuoc);
    }
  }

  // ── CNO ─────────────────────────────────────────────────────────────────

  private async sincronizarDenominacionesCno(qr: QueryRunner, cod: string, items: NombreSnapshotInput[]): Promise<void> {
    const existentes = await qr.manager.find(CnoDenominacion, { where: { ocupacion: { codOcupacionCno: cod } } });
    const porCodigo = new Map(existentes.map((d) => [d.codDenominacionCno, d]));
    const conservadas = new Set<string>();

    for (const item of items) {
      const nombre = item.nombre?.trim();
      if (!nombre) continue;
      const actual = porCodigo.get(item.codigo?.trim() ?? '');
      if (actual && !conservadas.has(actual.codDenominacionCno)) {
        conservadas.add(actual.codDenominacionCno);
        if (actual.descDenominacion !== nombre) {
          actual.descDenominacion = nombre;
          await qr.manager.save(CnoDenominacion, actual);
        }
        continue;
      }
      const siguiente = await siguienteConsecutivo(
        qr.manager,
        `cno_denominacion:${cod}`,
        `SELECT COALESCE(MAX(CAST(SUBSTRING(cod_denominacion_cno FROM '\\.(\\d+)$') AS INT)), 0) + 1 AS next
         FROM cno_denominacion WHERE cno_cod_ocupacion = $1`,
        [cod],
      );
      await qr.manager.save(
        CnoDenominacion,
        qr.manager.create(CnoDenominacion, {
          codDenominacionCno: `D-${cod}.${String(siguiente).padStart(3, '0')}`,
          descDenominacion: nombre,
          estado: 1,
          fechaReg: new Date(),
          ocupacion: { codOcupacionCno: cod } as CnoOcupacion,
        }),
      );
    }

    for (const d of existentes) {
      if (conservadas.has(d.codDenominacionCno) || d.estado === 0) continue;
      d.estado = 0;
      d.fechaInactivacion = new Date();
      await qr.manager.save(CnoDenominacion, d);
    }
  }

  private async sincronizarFuncionesCno(qr: QueryRunner, cod: string, items: FuncionSnapshotInput[]): Promise<void> {
    const existentes = await qr.manager.find(CnoRegFunciones, { where: { ocupacion: { codOcupacionCno: cod } } });
    const porCodigo = new Map(existentes.map((f) => [f.codigo, f]));
    const conservadas = new Set<string>();

    for (const item of items) {
      const descripcion = item.descripcion?.trim();
      if (!descripcion) continue;
      const codigo = item.codigo?.trim() ?? '';
      const actual = porCodigo.get(codigo);
      if (actual && !conservadas.has(actual.codigo)) {
        conservadas.add(actual.codigo);
        if (actual.descFuncionCno !== descripcion) {
          actual.descFuncionCno = descripcion;
          await qr.manager.save(CnoRegFunciones, actual);
        }
        continue;
      }

      // Nueva: función del catálogo (por código o descripción) o una nueva F-NNN.
      let catalogo =
        (codigo ? await qr.manager.findOne(CnoFuncion, { where: { codFuncion: codigo } }) : null) ??
        (await qr.manager.findOne(CnoFuncion, { where: { descFuncionCno: descripcion } }));
      if (!catalogo) {
        const n = await siguienteConsecutivo(
          qr.manager,
          'cno_funcion',
          `SELECT COALESCE(MAX(CAST(SUBSTRING(cod_funcion FROM 'F-(\\d+)') AS INT)), 0) + 1 AS next FROM cno_funcion`,
          [],
        );
        catalogo = await qr.manager.save(
          CnoFuncion,
          qr.manager.create(CnoFuncion, { codFuncion: `F-${String(n).padStart(3, '0')}`, descFuncionCno: descripcion }),
        );
      }
      const siguiente = await siguienteConsecutivo(
        qr.manager,
        `cno_reg_funciones:${cod}`,
        `SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM '\\.(\\d+)$') AS INT)), 0) + 1 AS next
         FROM cno_reg_funciones WHERE cno_ocupacion = $1`,
        [cod],
      );
      await qr.manager.save(
        CnoRegFunciones,
        qr.manager.create(CnoRegFunciones, {
          codigo: `F-${cod}.${String(siguiente).padStart(3, '0')}`,
          descFuncionCno: descripcion,
          estado: 1,
          ocupacion: { codOcupacionCno: cod } as CnoOcupacion,
          funcion: catalogo,
        }),
      );
    }

    for (const f of existentes) {
      if (conservadas.has(f.codigo) || f.estado === 0) continue;
      f.estado = 0;
      await qr.manager.save(CnoRegFunciones, f);
    }
  }

  private async sincronizarHabilidadesCno(qr: QueryRunner, cod: string, items: NombreSnapshotInput[]): Promise<void> {
    const deseadas = await this.resolverHabilidadesDeseadas(qr, items);
    const existentes = await qr.manager.find(CnoRegHabilidad, {
      where: { ocupacion: { codOcupacionCno: cod } },
      relations: ['habilidadDestreza'],
    });
    const yaVinculadas = new Set<number>();
    for (const reg of existentes) {
      const codCatalogo = reg.habilidadDestreza?.codHabDest;
      if (codCatalogo === undefined || !deseadas.has(codCatalogo) || yaVinculadas.has(codCatalogo)) {
        await qr.manager.remove(CnoRegHabilidad, reg);
      } else {
        yaVinculadas.add(codCatalogo);
      }
    }
    for (const [codCatalogo, catalogo] of deseadas) {
      if (yaVinculadas.has(codCatalogo)) continue;
      await qr.manager.save(
        CnoRegHabilidad,
        qr.manager.create(CnoRegHabilidad, {
          nombHabDest: catalogo.nombHabDest,
          habilidadDestreza: catalogo,
          ocupacion: { codOcupacionCno: cod } as CnoOcupacion,
        }),
      );
    }
  }

  private async sincronizarConocimientosCno(qr: QueryRunner, cod: string, items: NombreSnapshotInput[]): Promise<void> {
    const deseados = new Map<number, CnoConocimiento>();
    for (const item of items) {
      const nombre = item.nombre?.trim();
      if (!nombre) continue;
      const codigo = Number(item.codigo);
      let catalogo = Number.isInteger(codigo)
        ? await qr.manager.findOne(CnoConocimiento, { where: { codConocimiento: codigo } })
        : null;
      catalogo ??= await qr.manager.findOne(CnoConocimiento, { where: { nombConocimiento: nombre } });
      if (!catalogo) {
        const siguienteId = await this.siguienteEnteroLibre(qr, 'cno_conocimiento', 'cod_conocimiento');
        catalogo = await qr.manager.save(
          CnoConocimiento,
          qr.manager.create(CnoConocimiento, { codConocimiento: siguienteId, nombConocimiento: nombre, descConocimiento: nombre }),
        );
      }
      deseados.set(catalogo.codConocimiento, catalogo);
    }

    const existentes = await qr.manager.find(CnoRegConocimiento, {
      where: { ocupacion: { codOcupacionCno: cod } },
      relations: ['conocimiento'],
    });
    const yaVinculados = new Set<number>();
    for (const reg of existentes) {
      const codCatalogo = reg.conocimiento?.codConocimiento;
      if (codCatalogo === undefined || !deseados.has(codCatalogo) || yaVinculados.has(codCatalogo)) {
        await qr.manager.remove(CnoRegConocimiento, reg);
      } else {
        yaVinculados.add(codCatalogo);
      }
    }
    for (const [codCatalogo, catalogo] of deseados) {
      if (yaVinculados.has(codCatalogo)) continue;
      await qr.manager.save(
        CnoRegConocimiento,
        qr.manager.create(CnoRegConocimiento, {
          nombConocimiento: catalogo.nombConocimiento,
          conocimiento: catalogo,
          ocupacion: { codOcupacionCno: cod } as CnoOcupacion,
        }),
      );
    }
  }

  // ── CUOC ────────────────────────────────────────────────────────────────

  private async sincronizarDenominacionesCuoc(qr: QueryRunner, cod: string, items: NombreSnapshotInput[]): Promise<void> {
    const existentes = await qr.manager.find(CuocDenominacion, { where: { ocupacion: { codOcupacionCuoc: cod } } });
    const porCodigo = new Map(existentes.map((d) => [d.codDenominacion, d]));
    const conservadas = new Set<string>();

    for (const item of items) {
      const nombre = item.nombre?.trim();
      if (!nombre) continue;
      const actual = porCodigo.get(item.codigo?.trim() ?? '');
      if (actual && !conservadas.has(actual.codDenominacion)) {
        conservadas.add(actual.codDenominacion);
        if (actual.nomDenominacion !== nombre) {
          actual.nomDenominacion = nombre;
          await qr.manager.save(CuocDenominacion, actual);
        }
        continue;
      }
      const siguiente = await siguienteConsecutivo(
        qr.manager,
        `cuoc_denominacion:${cod}`,
        `SELECT COALESCE(MAX(CAST(SUBSTRING(cod_denominacion FROM '\\.(\\d+)$') AS INT)), 0) + 1 AS next
         FROM cuoc_denominacion WHERE cod_ocupacion_cuoc = $1`,
        [cod],
      );
      await qr.manager.save(
        CuocDenominacion,
        qr.manager.create(CuocDenominacion, {
          codDenominacion: `${cod}.${String(siguiente).padStart(3, '0')}`,
          nomDenominacion: nombre,
          estado: 1,
          fechaRegistro: new Date(),
          ocupacion: { codOcupacionCuoc: cod } as CuocOcupacion,
        }),
      );
    }

    for (const d of existentes) {
      if (conservadas.has(d.codDenominacion) || d.estado === 0) continue;
      d.estado = 0;
      await qr.manager.save(CuocDenominacion, d);
    }
  }

  private async sincronizarFuncionesCuoc(qr: QueryRunner, cod: string, items: FuncionSnapshotInput[]): Promise<void> {
    const existentes = await qr.manager.find(CuocFuncion, { where: { ocupacion: { codOcupacionCuoc: cod } } });
    const porCodigo = new Map(existentes.filter((f) => f.codFuncionCuoc).map((f) => [f.codFuncionCuoc, f]));
    const conservadas = new Set<number>();
    let siguiente =
      existentes.reduce((max, f) => Math.max(max, parseInt(f.codFuncionCuoc ?? '', 10) || 0), 0) + 1;

    for (const item of items) {
      const descripcion = item.descripcion?.trim();
      if (!descripcion) continue;
      const actual = porCodigo.get(item.codigo?.trim() ?? '');
      if (actual && !conservadas.has(actual.codigo)) {
        conservadas.add(actual.codigo);
        if (actual.nomFuncionCuoc !== descripcion) {
          actual.nomFuncionCuoc = descripcion;
          await qr.manager.save(CuocFuncion, actual);
        }
        continue;
      }
      // Consecutivo dentro de la ocupación, como en el Excel oficial.
      await qr.manager.save(
        CuocFuncion,
        qr.manager.create(CuocFuncion, {
          codFuncionCuoc: String(siguiente++),
          nomFuncionCuoc: descripcion,
          fechaRegistro: new Date(),
          estado: 1,
          ocupacion: { codOcupacionCuoc: cod } as CuocOcupacion,
        }),
      );
    }

    for (const f of existentes) {
      if (conservadas.has(f.codigo) || f.estado === 0) continue;
      f.estado = 0;
      f.fechaInactivo = new Date();
      await qr.manager.save(CuocFuncion, f);
    }
  }

  private async sincronizarDestrezasCuoc(qr: QueryRunner, cod: string, items: NombreSnapshotInput[]): Promise<void> {
    const deseadas = await this.resolverHabilidadesDeseadas(qr, items);
    const existentes = await qr.manager.find(CuocDestreza, {
      where: { ocupacion: { codOcupacionCuoc: cod } },
      relations: ['habilidadDestreza'],
    });
    const yaVinculadas = new Set<number>();
    for (const reg of existentes) {
      const codCatalogo = reg.habilidadDestreza?.codHabDest;
      if (codCatalogo === undefined || !deseadas.has(codCatalogo) || yaVinculadas.has(codCatalogo)) {
        await qr.manager.remove(CuocDestreza, reg);
      } else {
        yaVinculadas.add(codCatalogo);
      }
    }
    for (const [codCatalogo, catalogo] of deseadas) {
      if (yaVinculadas.has(codCatalogo)) continue;
      await qr.manager.save(
        CuocDestreza,
        qr.manager.create(CuocDestreza, {
          nombHabDest: catalogo.nombHabDest,
          habilidadDestreza: catalogo,
          ocupacion: { codOcupacionCuoc: cod } as CuocOcupacion,
        }),
      );
    }
  }

  private async sincronizarConocimientosCuoc(qr: QueryRunner, cod: string, items: NombreSnapshotInput[]): Promise<void> {
    const deseados = new Map<number, CuocConocimiento>();
    for (const item of items) {
      const nombre = item.nombre?.trim();
      if (!nombre) continue;
      const codigo = Number(item.codigo);
      let catalogo = Number.isInteger(codigo)
        ? await qr.manager.findOne(CuocConocimiento, { where: { codConocimiento: codigo } })
        : null;
      catalogo ??= await qr.manager.findOne(CuocConocimiento, { where: { nombConocimiento: nombre } });
      if (!catalogo) {
        const siguienteId = await this.siguienteEnteroLibre(qr, 'cuoc_conocimiento', 'cod_conocimiento');
        catalogo = await qr.manager.save(
          CuocConocimiento,
          qr.manager.create(CuocConocimiento, { codConocimiento: siguienteId, nombConocimiento: nombre, descConocimiento: nombre }),
        );
      }
      deseados.set(catalogo.codConocimiento, catalogo);
    }

    const existentes = await qr.manager.find(CuocRegConocimiento, {
      where: { ocupacion: { codOcupacionCuoc: cod } },
      relations: ['conocimiento'],
    });
    const yaVinculados = new Set<number>();
    for (const reg of existentes) {
      const codCatalogo = reg.conocimiento?.codConocimiento;
      if (codCatalogo === undefined || !deseados.has(codCatalogo) || yaVinculados.has(codCatalogo)) {
        await qr.manager.remove(CuocRegConocimiento, reg);
      } else {
        yaVinculados.add(codCatalogo);
      }
    }
    for (const [codCatalogo, catalogo] of deseados) {
      if (yaVinculados.has(codCatalogo)) continue;
      await qr.manager.save(
        CuocRegConocimiento,
        qr.manager.create(CuocRegConocimiento, {
          nombConocimiento: catalogo.nombConocimiento,
          conocimiento: catalogo,
          ocupacion: { codOcupacionCuoc: cod } as CuocOcupacion,
        }),
      );
    }
  }

  /** Habilidades/destrezas del catálogo compartido: por código si existe, si no por nombre (o se crean). */
  private async resolverHabilidadesDeseadas(
    qr: QueryRunner,
    items: NombreSnapshotInput[],
  ): Promise<Map<number, HabilidadDestreza>> {
    const deseadas = new Map<number, HabilidadDestreza>();
    for (const item of items) {
      const nombre = item.nombre?.trim();
      if (!nombre) continue;
      const codigo = Number(item.codigo);
      const catalogo =
        (Number.isInteger(codigo) ? await qr.manager.findOne(HabilidadDestreza, { where: { codHabDest: codigo } }) : null) ??
        (await this.resolverHabilidadDestreza(qr, nombre));
      deseadas.set(catalogo.codHabDest, catalogo);
    }
    return deseadas;
  }

  // ============================================================
  // Eliminar una copia completa (usado por Instrumento2Service.remove)
  // ============================================================

  /**
   * Borra la copia CNO (fila de ocupación + todas sus filas hijas). No toca
   * los catálogos compartidos reutilizables (cno_funcion, cno_conocimiento,
   * habilidad_destreza, cno_area_desempeno, cno_nivel_cualificacion): esas
   * filas pueden haber sido reutilizadas de una ocupación ya existente, así
   * que se dejan intactas (huérfanas en el peor caso, nunca datos perdidos).
   */
  async eliminarCopiaCno(qr: QueryRunner, codOcupacion: string): Promise<void> {
    // Borrar nunca puede alcanzar al catálogo: una ocupación original no es
    // "la copia de nadie" y eliminarla se llevaría por delante sus hijos.
    this.assertEsCopia(
      await qr.manager.findOne(CnoOcupacion, { where: { codOcupacionCno: codOcupacion } }),
      codOcupacion,
      'CNO',
    );

    await this.borrarHijosPorRelacion(qr, CnoRegFunciones, codOcupacion, 'codOcupacionCno');
    await this.borrarHijosPorRelacion(qr, CnoDenominacion, codOcupacion, 'codOcupacionCno');
    await this.borrarHijosPorRelacion(qr, CnoRegHabilidad, codOcupacion, 'codOcupacionCno');
    await this.borrarHijosPorRelacion(qr, CnoRegConocimiento, codOcupacion, 'codOcupacionCno');
    await this.borrarHijosPorRelacion(qr, CnoRelacionada, codOcupacion, 'codOcupacionCno');

    await qr.manager.delete(CnoOcupacion, { codOcupacionCno: codOcupacion });
  }

  async eliminarCopiaCuoc(qr: QueryRunner, codOcupacion: string): Promise<void> {
    this.assertEsCopia(
      await qr.manager.findOne(CuocOcupacion, { where: { codOcupacionCuoc: codOcupacion } }),
      codOcupacion,
      'CUOC',
    );

    await this.borrarHijosPorRelacion(qr, CuocFuncion, codOcupacion, 'codOcupacionCuoc');
    await this.borrarHijosPorRelacion(qr, CuocDenominacion, codOcupacion, 'codOcupacionCuoc');
    await this.borrarHijosPorRelacion(qr, CuocDestreza, codOcupacion, 'codOcupacionCuoc');
    await this.borrarHijosPorRelacion(qr, CuocRegConocimiento, codOcupacion, 'codOcupacionCuoc');
    await this.borrarHijosPorRelacion(qr, CuocOcupacionAfin, codOcupacion, 'codOcupacionCuoc');

    await qr.manager.delete(CuocOcupacion, { codOcupacionCuoc: codOcupacion });
  }

  /**
   * Busca y elimina las filas hijas de una copia de ocupación, filtrando por
   * la relación `ocupacion` (find + remove en dos pasos: `delete()` con
   * criterio anidado por relación no es fiable en todos los drivers de
   * TypeORM 0.3, `find()`+`remove()` sí lo es).
   */
  private async borrarHijosPorRelacion<T extends object>(
    qr: QueryRunner,
    entidad: new () => T,
    codOcupacion: string,
    campoCodigo: 'codOcupacionCno' | 'codOcupacionCuoc',
  ): Promise<void> {
    const filas = await qr.manager.find(entidad, {
      where: { ocupacion: { [campoCodigo]: codOcupacion } } as any,
    });
    if (filas.length > 0) {
      await qr.manager.remove(entidad, filas);
    }
  }

  // ============================================================
  // Utilidades
  // ============================================================

  /**
   * Siguiente entero libre para las columnas PK que este servicio inserta a
   * mano, ya sea porque no tienen secuencia SERIAL en BD
   * (cuoc_nivel_competencia.cod_nivel, cuoc_conocimiento.cod_conocimiento) o
   * porque la tienen pero quedó desincronizada con los datos ya cargados
   * (cno_conocimiento.cod_conocimiento, habilidad_destreza.cod_hab_dest: la
   * carga masiva del Excel los inserta con su código oficial explícito, lo que
   * no avanza el nextval()).
   * No es 100% a prueba de condiciones de carrera bajo alta concurrencia,
   * pero es consistente con el resto de esta app (herramienta interna, baja
   * concurrencia) y corre dentro de la misma transacción que la fila que lo
   * usará.
   */
  async siguienteEnteroLibre(qr: QueryRunner, tabla: string, columna: string): Promise<number> {
    const resultado = await qr.query(
      `SELECT COALESCE(MAX(${columna}), 0) + 1 AS valor FROM clasificacion.${tabla}`,
    );
    return Number(resultado[0].valor);
  }

  /**
   * Estado (smallint) de una función o denominación copiada. Antes todas se
   * escribían con 1: una dada de baja en el catálogo revivía como activa en
   * la copia de Análisis y llegaba así a Validación experta. Sin estado
   * reconocible (elemento nuevo) queda activa.
   */
  estadoItem(estado?: string): 0 | 1 {
    return this.parseEstado(estado) === false ? 0 : 1;
  }

  parseEstado(estado?: string): boolean | null {
    if (!estado?.trim()) return null;
    const lower = estado.trim().toLowerCase();
    if (lower === 'true' || lower === 'activo' || lower === '1') return true;
    if (lower === 'false' || lower === 'inactivo' || lower === '0') return false;
    return null;
  }

  parseDate(dateStr?: string): Date | null {
    if (!dateStr?.trim()) return null;
    const d = new Date(dateStr.trim());
    return isNaN(d.getTime()) ? null : d;
  }
}
