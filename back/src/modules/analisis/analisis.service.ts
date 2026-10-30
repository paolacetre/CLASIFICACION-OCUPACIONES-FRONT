import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';

import { CnoOcupacion } from '../cno/entities/cno-ocupacion.entity';
import { CuocOcupacion } from '../cuoc/entities/cuoc-ocupacion.entity';
import { ComparativaOcupacion } from './entities/comparativa-ocupacion.entity';
import { Instrumento } from '../instrumento2/entities/instrumento.entity';
import { Instrumento2Estado } from '../instrumento2/enums/instrumento2-estado.enum';
import { OcupacionCopiaService } from '../ocupacion-copia/ocupacion-copia.service';
import { GuardarAnalisisDto, PanelAnalisisDto } from './dto/guardar-analisis.dto';
import { GuardarOcupacionAnalisis2Dto } from './dto/guardar-ocupacion-analisis2.dto';

export interface GuardarAnalisisResponse {
  requestId: string;
  comparativaCodigo: number;
  instrumentoId: number;
  token: string;
  processedAt: string;
  /**
   * Copia creada para cada panel enviado.
   *
   * El código de una copia lo decide este servicio
   * (`OcupacionCopiaService.construirCodigoCopia`) y depende del orden en que
   * se copian los paneles, no de su posición en la pantalla. Devolverlo evita
   * que el frontend tenga que deducirlo: sin esto, Análisis no sabría a qué
   * ocupación apuntar al reeditar los paneles que NO son el seleccionado, y
   * sus cambios se perderían en el siguiente guardado.
   */
  paneles: Array<{ panel: 'left' | 'center' | 'right'; codigoCopia: string }>;
}

/**
 * Genera copias propias de CADA ocupación comparada en Análisis (los hasta 3
 * paneles, no solo el que se envía a Instrumento 2) hacia las tablas
 * originales (`cno_ocupacion`/`cuoc_ocupacion` y sus tablas hijas), en vez de
 * reutilizar el código de la ocupación fuente. Cada copia recibe un código
 * nuevo derivado del código original, del `comparativa_ocupacion.codigo` y de
 * su posición entre los paneles (ver `OcupacionCopiaService.construirCodigoCopia`).
 *
 * Los 6 slots de `comparativa_ocupacion` (`cod_ocupacion_cno`/`cno2`/`cno3` y
 * sus equivalentes CUOC) e `instrumento.ocupacion` apuntan SIEMPRE a esas
 * copias, nunca al código original: Análisis es de solo lectura sobre el
 * catálogo real. Así cada fila de comparativa queda como una "foto" de
 * historial autocontenida —incluidas las ediciones que el analista haya hecho
 * sobre los dos paneles que no van a Instrumento 2—, en vez de compartir una
 * referencia mutable con el catálogo o con otras comparativas que usen la
 * misma ocupación fuente. Esto también es lo que permite a Instrumento 2
 * editar su copia libremente sin arriesgar el catálogo real (ver
 * `Instrumento2Service`).
 *
 * La lógica de copiar/editar/borrar ocupaciones vive en `OcupacionCopiaService`
 * (módulo `ocupacion-copia`), compartida con `Instrumento2Service`.
 */
@Injectable()
export class AnalisisService {
  private readonly logger = new Logger(AnalisisService.name);

  constructor(
    private readonly ocupacionCopiaService: OcupacionCopiaService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * `idUsuario` viene siempre del JWT (`AnalisisController` lo extrae con
   * `@CurrentUser()`), nunca del body: así no depende de que exista un
   * usuario "id=1" por defecto, y nadie puede atribuirse un análisis a
   * nombre de otro usuario.
   */
  async guardarAnalisis(dto: GuardarAnalisisDto, idUsuario: number): Promise<GuardarAnalisisResponse> {
    if (!dto.cno && !dto.cuoc && !dto.relacion) {
      throw new BadRequestException(
        'Debe proporcionar al menos un panel (cno, cuoc o relacion) con datos.',
      );
    }

    const paneles: Array<{ key: 'left' | 'center' | 'right'; panel: PanelAnalisisDto | null | undefined }> = [
      { key: 'left', panel: dto.cno },
      { key: 'center', panel: dto.cuoc },
      { key: 'right', panel: dto.relacion },
    ];

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Cada uno de los 3 paneles se resuelve de forma independiente contra
      // ambos catálogos ("análisis libre": cualquier recuadro puede traer un
      // código CNO o CUOC, sin importar en cuál quedó soltado).
      const resueltos: Array<{
        key: 'left' | 'center' | 'right';
        panel: PanelAnalisisDto;
        codigo: string;
        esCno: boolean;
        esCuoc: boolean;
      }> = [];
      for (const { key, panel } of paneles) {
        const codigo = panel?.codigo?.trim();
        if (!panel || !codigo) continue;

        const esCno = await qr.manager.exists(CnoOcupacion, { where: { codOcupacionCno: codigo } });
        const esCuoc = await qr.manager.exists(CuocOcupacion, { where: { codOcupacionCuoc: codigo } });
        resueltos.push({ key, panel, codigo, esCno, esCuoc });
      }

      if (resueltos.every((r) => !r.esCno && !r.esCuoc)) {
        throw new BadRequestException(
          'Ninguno de los códigos proporcionados corresponde a una ocupación CNO o CUOC existente.',
        );
      }

      // De los tres paneles, solo el seleccionado por el analista es el que se
      // envía a Instrumento 2; los otros dos quedan únicamente como historial
      // en comparativa_ocupacion (no generan fila en `instrumento`).
      const seleccionado = resueltos.find((r) => r.key === dto.panelSeleccionado);
      if (!seleccionado || (!seleccionado.esCno && !seleccionado.esCuoc)) {
        throw new BadRequestException(
          'El panel seleccionado para enviar a Instrumento 2 no corresponde a una ocupación CNO o CUOC existente.',
        );
      }

      // comparativa_ocupacion.codigo es @PrimaryGeneratedColumn: TypeORM SIEMPRE
      // deja que Postgres lo genere vía su propio nextval() al hacer INSERT,
      // ignorando cualquier valor que se le asigne a mano de antemano (a
      // diferencia de columnas @PrimaryColumn simples, donde sí se respeta un
      // valor pre-reservado). Por eso la fila se inserta primero —con los
      // datos que no dependen del código— para obtener el codigo REAL ya
      // asignado por la base de datos, y ese es el que se usa después como
      // sufijo de las copias y semilla del token: así nunca queda un mismatch
      // entre lo que dice el token/las copias y lo que realmente quedó
      // grabado en comparativa_ocupacion.
      let comparativaOcupacion = qr.manager.create(ComparativaOcupacion, {
        descripcion:
          seleccionado.panel.descripcion ??
          dto.cno?.descripcion ??
          dto.cuoc?.descripcion ??
          dto.relacion?.descripcion ??
          '',
        estado: 'PENDIENTE_I2',
        fechaRegistro: new Date(),
        idUsuario,
      });
      comparativaOcupacion = await qr.manager.save(ComparativaOcupacion, comparativaOcupacion);
      const comparativaCodigo = comparativaOcupacion.codigo;

      const token = `I2-${comparativaCodigo}-${randomUUID().slice(0, 8)}`;

      // Se copian LOS TRES paneles, no solo el que va a Instrumento 2: los
      // otros dos también pudieron editarse en el formulario, y esas ediciones
      // tienen que quedar en una copia propia en vez de perderse o —peor—
      // guardarse como una referencia al código real del catálogo.
      //
      // El seleccionado se copia primero para que ocupe el slot principal de
      // su catálogo (`cod_ocupacion_cno`/`cod_ocupacion_cuoc`), el único de los
      // tres con FK declarada hacia la tabla de ocupaciones.
      const ordenCopia = [seleccionado, ...resueltos.filter((r) => r !== seleccionado)];
      const copiasCno: string[] = [];
      const copiasCuoc: string[] = [];
      const copiasPorPanel: GuardarAnalisisResponse['paneles'] = [];
      let codigoParaInstrumento = '';

      for (const [posicion, r] of ordenCopia.entries()) {
        // Un panel cuyo código no existe en ningún catálogo no tiene origen que
        // copiar; se ignora (el seleccionado ya quedó validado arriba).
        if (!r.esCno && !r.esCuoc) continue;

        // La posición entra en el código de la copia: sin ella, dos paneles con
        // la MISMA ocupación de origen generarían el mismo código y chocarían.
        const indicePanel = posicion + 1;
        const nuevoCodigo = r.esCno
          ? await this.ocupacionCopiaService.copiarOcupacionCno(
              qr,
              r.panel,
              r.codigo,
              comparativaCodigo,
              indicePanel,
            )
          : await this.ocupacionCopiaService.copiarOcupacionCuoc(
              qr,
              r.panel,
              r.codigo,
              comparativaCodigo,
              indicePanel,
            );

        (r.esCno ? copiasCno : copiasCuoc).push(nuevoCodigo);
        copiasPorPanel.push({ panel: r.key, codigoCopia: nuevoCodigo });
        if (r === seleccionado) codigoParaInstrumento = nuevoCodigo;
      }

      // Ahora sí, con las copias ya creadas, se completa la fila (ya existente,
      // con su codigo real) con las referencias a las ocupaciones comparadas.
      // Los 6 slots guardan siempre códigos de copia, nunca los originales.
      comparativaOcupacion.ocupacionCno = copiasCno[0]
        ? ({ codOcupacionCno: copiasCno[0] } as CnoOcupacion)
        : null;
      comparativaOcupacion.codOcupacionCno2 = copiasCno[1] ?? null;
      comparativaOcupacion.codOcupacionCno3 = copiasCno[2] ?? null;
      comparativaOcupacion.ocupacionCuoc = copiasCuoc[0]
        ? ({ codOcupacionCuoc: copiasCuoc[0] } as CuocOcupacion)
        : null;
      comparativaOcupacion.codOcupacionCuoc2 = copiasCuoc[1] ?? null;
      comparativaOcupacion.codOcupacionCuoc3 = copiasCuoc[2] ?? null;
      await qr.manager.save(ComparativaOcupacion, comparativaOcupacion);

      // instrumento.ocupacion es un campo de texto libre (sin FK) que apunta
      // siempre a la copia del panel SELECCIONADO (nunca a los otros dos, que
      // quedan solo como historial arriba).
      const instrumento = qr.manager.create(Instrumento, {
        tipo: 'instrumento2',
        ocupacion: codigoParaInstrumento,
        fecha: new Date(),
        estado: Instrumento2Estado.PENDIENTE,
        usuario: { idUsuario } as Instrumento['usuario'],
        comparativaOcupacion: { codigo: comparativaOcupacion.codigo } as Instrumento['comparativaOcupacion'],
      });
      await qr.manager.save(Instrumento, instrumento);

      await qr.commitTransaction();

      this.logger.log(
        `Análisis guardado: comparativa_ocupacion.codigo=${comparativaOcupacion.codigo}, instrumento=${instrumento.idInstrumento}, token=${token}`,
      );

      return {
        requestId: token,
        comparativaCodigo: comparativaOcupacion.codigo,
        instrumentoId: instrumento.idInstrumento,
        token,
        processedAt: new Date().toISOString(),
        paneles: copiasPorPanel,
      };
    } catch (error) {
      await qr.rollbackTransaction();
      this.logger.error('Error al guardar análisis', error);
      throw error;
    } finally {
      await qr.release();
    }
  }

  /**
   * Actualización: guarda la edición sobre la ocupación ORIGINAL del catálogo
   * (a diferencia de Análisis, que siempre crea una copia). Todo o nada.
   */
  async actualizarOcupacionOriginal(dto: GuardarOcupacionAnalisis2Dto): Promise<{ codigo: string }> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      if (dto.tipo === 'cno') {
        await this.ocupacionCopiaService.actualizarOriginalCno(qr, dto.panel.codigo, dto.panel);
      } else {
        await this.ocupacionCopiaService.actualizarOriginalCuoc(qr, dto.panel.codigo, dto.panel);
      }
      await qr.commitTransaction();
      this.logger.log(`Ocupación ${dto.tipo.toUpperCase()} ${dto.panel.codigo} actualizada en el catálogo original.`);
      return { codigo: dto.panel.codigo };
    } catch (error) {
      await qr.rollbackTransaction();
      this.logger.error(`Error al actualizar la ocupación original ${dto.panel.codigo}`, error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
