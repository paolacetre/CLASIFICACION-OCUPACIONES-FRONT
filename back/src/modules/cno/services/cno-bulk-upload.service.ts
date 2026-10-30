import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { DataSource, DeepPartial, EntityManager, EntityTarget } from 'typeorm';
import * as XLSX from 'xlsx';
import {
  CnoAreaDesempeno,
  CnoConocimiento,
  CnoFuncion,
  CnoNivelCualificacion,
  CnoOcupacion,
  CnoDenominacion,
  CnoRegFunciones,
  CnoRegHabilidad,
  CnoRegConocimiento,
  CnoRelacionada,
} from '../entities';
import { HabilidadDestreza } from '../../shared/entities/habilidad-destreza.entity';
import { BulkUploadResult, SheetResult, newSheetResult } from '../utils/cno-import.types';
import {
  ExcelRow,
  findSheet,
  findSheetName,
  findHeaderRow,
  sheetToRowsWithIndex,
  normalizeHeaderKey,
  getColumn,
  getColumnCode,
  getColumnStr,
  getColumnInt,
  getColumnFecha,
  parseBooleanFlag,
  buildKey,
  formatImportError,
  formatSkipDetail,
  describeDbError,
  insertarEnLotes,
  guardarEnLotes,
} from '../utils/cno-import.utils';
import { DEFINICIONES_CNO, TipoCargaCno, normalizarEncabezado } from '../config/cno-carga.config';
import { resincronizarSecuencia } from '../utils/cno-secuencia.util';

/**
 * Alias aceptados por hoja. Es la unica fuente de verdad de "que hojas conoce el
 * cargue": el reporte de hojas no reconocidas se deriva de aqui, asi que agregar
 * un procesador nuevo sin registrar su alias lo delata solo.
 */
const ALIAS_HOJA = {
  areaDesempeno: ['Area_desempeno', 'Area_desempeño', 'Area de desempeno', 'Area de desempeño'],
  nivelCualificacion: ['nivel_cualificacion', 'Area_cualificacion', 'Area de cualificacion', 'Nivel de cualificacion', 'Nivel de cualificación'],
  funcion: ['Funcion', 'Funciones'],
  habilidad: ['Habilidad', 'Habilidades'],
  conocimiento: ['Nivel de conocimiento', 'Nivel_conocimiento', 'Nivel conocimiento', 'Conocimientos', 'Conocimiento'],
  ocupaciones: [
    'Ocupaciones - C.N.O. (2)',
    'Ocupaciones - C.N.O. (1)',
    'Ocupaciones - C.N.O. ',
    'Ocupaciones - C.N.O.',
    'Ocupaciones CNO',
    'Ocupaciones',
  ],
  funcionesRelacion: ['Funciones - C.N.O.', 'Funciones CNO', 'Funciones'],
  denominaciones: ['Denominaciones - C.N.O.', 'Denominaciones CNO', 'Denominaciones'],
  relacionadas: ['Relacionadas - C.N.O.', 'Relacionadas CNO', 'Relacionadas'],
  habilidadesRelacion: ['Habilidades - C.N.O.', 'Habilidades CNO', 'Habilidades'],
  conocimientosRelacion: ['Conocimientos - C.N.O.', 'Conocimientos CNO', 'Conocimientos'],
} as const;

/**
 * Hojas sin las cuales el cargue no tiene sentido: si falta alguna, se rechaza el archivo.
 * Nota: 'funcion', 'habilidad' y 'conocimiento' son opcionales porque este Excel oficial
 * embebe el catálogo dentro de sus respectivas hojas de relación ('Funciones - C.N.O.',
 * 'Habilidades - C.N.O.' y 'Conocimientos - C.N.O.').
 */
const HOJAS_OBLIGATORIAS: Array<[keyof typeof ALIAS_HOJA, string]> = [
  ['ocupaciones', 'Ocupaciones - C.N.O.'],
  ['funcionesRelacion', 'Funciones - C.N.O.'],
  ['denominaciones', 'Denominaciones - C.N.O.'],
  ['relacionadas', 'Relacionadas - C.N.O.'],
  ['habilidadesRelacion', 'Habilidades - C.N.O.'],
  ['conocimientosRelacion', 'Conocimientos - C.N.O.'],
];

/**
 * Carga masiva (sincronizacion) de datos CNO desde Excel.
 *
 * Arquitectura, en tres reglas:
 *
 * 1. **Cada hoja de catalogo llena su propia tabla, y solo esa.** Las hojas de
 *    relacion nunca crean entradas de catalogo: si referencian un codigo que no
 *    existe, reportan el error y saltan la fila. El cargue no inventa datos —
 *    escribe lo que trae la plantilla o no escribe nada.
 *
 * 2. **Una transaccion por hoja.** Un fallo tecnico revierte esa hoja completa (y
 *    sus contadores vuelven a cero, porque nada quedo en la base); un dato malo
 *    en una fila se reporta y se salta sin tumbar el resto.
 *
 * 3. **Por lotes, no fila por fila.** Cada hoja se resuelve entera en memoria
 *    contra lo que ya existe en BD y se vuelca con INSERT/UPDATE multi-fila. Una
 *    transaccion vive en una sola conexion y no admite queries en paralelo, asi
 *    que la concurrencia por fila que habia antes era incompatible con el punto 2;
 *    los lotes ademas son mas rapidos que aquella concurrencia.
 */
@Injectable()
export class CnoBulkUploadService {
  private readonly logger = new Logger(CnoBulkUploadService.name);

  /**
   * Si el usuario sube el mismo archivo dos veces casi seguidas (por ejemplo porque
   * la carga tarda y desde el navegador parece "trabada"), se disparan dos ejecuciones
   * independientes que compiten por las mismas tablas. Este flag evita que una segunda
   * arranque mientras la anterior sigue corriendo.
   */
  private uploadEnCurso = false;

  constructor(private readonly dataSource: DataSource) {}

  async processExcel(buffer: Buffer): Promise<BulkUploadResult> {
    if (this.uploadEnCurso) {
      throw new ConflictException(
        'Ya hay una carga masiva de CNO en curso. Espere a que termine antes de volver a subir el archivo; ' +
          'subirlo dos veces al tiempo es lo que causaba que se omitieran registros.',
      );
    }
    this.uploadEnCurso = true;
    try {
      return await this.processExcelInternal(buffer);
    } finally {
      this.uploadEnCurso = false;
    }
  }

  private async processExcelInternal(buffer: Buffer): Promise<BulkUploadResult> {
    const startedAt = Date.now();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    this.logger.log(`Pestanas encontradas: ${workbook.SheetNames.join(', ')}`);

    // Se resuelve el nombre real de cada hoja conocida para (a) localizarla y
    // (b) saber cuales del archivo quedaron sin procesar.
    const nombreHoja = {} as Record<keyof typeof ALIAS_HOJA, string | undefined>;
    for (const clave of Object.keys(ALIAS_HOJA) as Array<keyof typeof ALIAS_HOJA>) {
      nombreHoja[clave] = findSheetName(workbook, [...ALIAS_HOJA[clave]]);
    }

    const faltantes = HOJAS_OBLIGATORIAS.filter(([clave]) => !nombreHoja[clave]).map(([, etiqueta]) => etiqueta);
    if (faltantes.length) {
      throw new BadRequestException(`Faltan las siguientes pestanas en el Excel: ${faltantes.join(', ')}`);
    }

    const hoja = (clave: keyof typeof ALIAS_HOJA): XLSX.WorkSheet | undefined =>
      findSheet(workbook, [...ALIAS_HOJA[clave]]);

    const results: SheetResult[] = [];

    // 1-5: catalogos. Cada uno es autosuficiente y no depende de las relaciones.
    results.push(await this.cargarAreaDesempeno(hoja('areaDesempeno')));
    results.push(await this.cargarNivelCualificacion(hoja('nivelCualificacion')));
    results.push(await this.cargarFuncionCatalogo(hoja('funcion'), hoja('funcionesRelacion')));
    // Si el Excel tiene hoja propia de catálogo ('Habilidad' / 'Nivel de conocimiento') se usa;
    // si no, los únicos del catálogo se extraen de las hojas de relación embebidas.
    results.push(await this.cargarHabilidadCatalogo(hoja('habilidad'), hoja('habilidadesRelacion')));
    results.push(await this.cargarConocimientoCatalogo(hoja('conocimiento'), hoja('conocimientosRelacion')));

    // 6: ocupaciones (necesita area y nivel ya cargados para denormalizar sus nombres).
    results.push(await this.cargarOcupaciones(hoja('ocupaciones')!));

    // 7-11: relaciones (necesitan ocupaciones y catalogos ya cargados).
    results.push(await this.cargarFuncionesRelacion(hoja('funcionesRelacion')!));
    results.push(await this.cargarDenominaciones(hoja('denominaciones')!));
    results.push(await this.cargarRelacionadas(hoja('relacionadas')!));
    results.push(await this.cargarHabilidadesRelacion(hoja('habilidadesRelacion')!));
    results.push(await this.cargarConocimientosRelacion(hoja('conocimientosRelacion')!));

    // 12: verificacion final, no escribe nada.
    results.push(await this.verificarCatalogosContraRelaciones());
    results.push(this.reportarHojasNoReconocidas(workbook, nombreHoja));

    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
    const totalUnreadable = results.reduce((s, r) => s + r.unreadable, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
    const totalWarnings = results.reduce((s, r) => s + r.warnings.length, 0);

    const elapsedMs = Date.now() - startedAt;
    const elapsedLabel = this.formatElapsed(elapsedMs);
    const avisos = totalWarnings > 0 ? ` ${totalWarnings} avisos.` : '';
    const cifras = `Insertados: ${totalInserted}, actualizados: ${totalUpdated}, omitidos: ${totalSkipped}.`;

    // Una fila ilegible es dato del Excel que se perdio, asi que nunca puede
    // reportarse como exito aunque no haya saltado ninguna excepcion.
    const ilegibles =
      totalUnreadable > 0
        ? ` ATENCION: ${totalUnreadable} filas del Excel no se pudieron leer y NO se cargaron; ` +
          `revise 'skippedDetails' de cada hoja para ver cuales.`
        : '';

    let globalMessage: string;
    if (totalErrors > 0) {
      globalMessage = `Sincronizacion finalizada en ${elapsedLabel} con ${totalErrors} errores. ${cifras}${ilegibles}${avisos}`;
    } else if (totalUnreadable > 0) {
      globalMessage = `Sincronizacion finalizada en ${elapsedLabel} SIN errores tecnicos pero con datos sin cargar. ${cifras}${ilegibles}${avisos}`;
    } else {
      globalMessage = `Sincronizacion completada con exito en ${elapsedLabel}. ${cifras}${avisos}`;
    }

    if (totalErrors > 0 || totalUnreadable > 0) this.logger.warn(globalMessage);
    else this.logger.log(globalMessage);
    return { message: globalMessage, totalInserted, totalUpdated, totalSkipped, totalUnreadable, totalErrors, totalWarnings, elapsedMs, sheets: results };
  }

  // ============================================================
  // Carga guiada por tipo (paridad con CuocBulkUploadService.procesarTipo)
  //
  // A diferencia de processExcel() (que exige TODAS las hojas obligatorias
  // del libro completo), esto carga solo la hoja del tipo elegido, dentro de
  // su propia transaccion, reusando los mismos cargarXxx() de arriba. El tipo
  // 'ocupacion' agrupa la ocupacion y sus hojas de relacion (funciones,
  // denominaciones, relacionadas, habilidades, conocimientos) porque sin la
  // ocupacion ya creada esas relaciones no tienen a que engancharse — mismo
  // criterio que usa CUOC para su tipo 'ocupacion'.
  // ============================================================

  async procesarTipo(
    buffer: Buffer,
    tipo: TipoCargaCno,
    mapeoManual?: Record<string, string>,
  ): Promise<BulkUploadResult> {
    const startedAt = Date.now();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    this.aplicarMapeoManualTipo(workbook, tipo, mapeoManual);

    const results: SheetResult[] = [];
    const definicion = DEFINICIONES_CNO[tipo];

    switch (tipo) {
      case 'nivel':
        results.push(await this.cargarNivelCualificacion(findSheet(workbook, [...definicion.hojas])));
        break;
      case 'area':
        results.push(await this.cargarAreaDesempeno(findSheet(workbook, [...definicion.hojas])));
        break;
      case 'habilidades':
        results.push(
          await this.cargarHabilidadCatalogo(
            findSheet(workbook, [...definicion.hojas]),
            findSheet(workbook, ['Habilidades - C.N.O.', 'Habilidades CNO', 'Habilidades']),
          ),
        );
        break;
      case 'conocimientos':
        results.push(
          await this.cargarConocimientoCatalogo(
            findSheet(workbook, [...definicion.hojas]),
            findSheet(workbook, ['Conocimientos - C.N.O.', 'Conocimientos CNO', 'Conocimientos']),
          ),
        );
        break;
      case 'ocupacion': {
        const wsOcupacion = findSheet(workbook, [...definicion.hojas]);
        if (!wsOcupacion) {
          const vacio = newSheetResult('Ocupaciones - C.N.O.', 'cno_ocupacion');
          vacio.warnings.push('No se encontró en el archivo ninguna hoja de Ocupaciones; no se cargó nada.');
          results.push(vacio);
          break;
        }
        results.push(await this.cargarOcupaciones(wsOcupacion));

        const wsFunciones = findSheet(workbook, ['Funciones - C.N.O.', 'Funciones CNO', 'Funciones']);
        // El catalogo de funciones va antes que su relacion: sin el, en una base
        // vacia cada fila de "Funciones - C.N.O." fallaba con "Funcion ... no
        // encontrada en cno_funcion" y la carga inicial dejaba 0 funciones. Si el
        // libro no trae la hoja «Funcion», el catalogo sale de la propia hoja de
        // relacion, igual que en processExcel().
        const wsFuncionCatalogo = findSheet(workbook, [...ALIAS_HOJA.funcion]);
        if (wsFuncionCatalogo || wsFunciones) {
          results.push(await this.cargarFuncionCatalogo(wsFuncionCatalogo, wsFunciones));
        }
        if (wsFunciones) results.push(await this.cargarFuncionesRelacion(wsFunciones));

        const wsDenominaciones = findSheet(workbook, ['Denominaciones - C.N.O.', 'Denominaciones CNO', 'Denominaciones']);
        if (wsDenominaciones) results.push(await this.cargarDenominaciones(wsDenominaciones));

        const wsRelacionadas = findSheet(workbook, ['Relacionadas - C.N.O.', 'Relacionadas CNO', 'Relacionadas']);
        if (wsRelacionadas) results.push(await this.cargarRelacionadas(wsRelacionadas));

        const wsHabilidadesRel = findSheet(workbook, ['Habilidades - C.N.O.', 'Habilidades CNO', 'Habilidades']);
        if (wsHabilidadesRel) results.push(await this.cargarHabilidadesRelacion(wsHabilidadesRel));

        const wsConocimientosRel = findSheet(workbook, ['Conocimientos - C.N.O.', 'Conocimientos CNO', 'Conocimientos']);
        if (wsConocimientosRel) results.push(await this.cargarConocimientosRelacion(wsConocimientosRel));
        break;
      }
    }

    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
    const totalUnreadable = results.reduce((s, r) => s + r.unreadable, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
    const totalWarnings = results.reduce((s, r) => s + r.warnings.length, 0);
    const elapsedMs = Date.now() - startedAt;

    const cifras = `Insertados: ${totalInserted}, actualizados: ${totalUpdated}, omitidos: ${totalSkipped}.`;
    const message =
      totalErrors > 0
        ? `Carga de «${definicion.etiqueta}» finalizada con ${totalErrors} error(es). ${cifras}`
        : `Carga de «${definicion.etiqueta}» completada. ${cifras}`;

    this.logger.log(`[CNO-Bulk-Tipo] ${message}`);
    return { message, totalInserted, totalUpdated, totalSkipped, totalUnreadable, totalErrors, totalWarnings, elapsedMs, sheets: results };
  }

  /**
   * Renombra, en la hoja del tipo elegido, el encabezado de cada columna que
   * el usuario corrigió a mano en «Configurar» por el alias oficial del campo
   * al que la asignó. Así, cuando el `cargarXxx()` de siempre vuelva a leer la
   * hoja, encuentra esa columna como si el archivo hubiera traído el
   * encabezado esperado — sin tocar esos métodos. Mismo mecanismo que
   * `CuocBulkUploadService.aplicarMapeoManual`.
   */
  private aplicarMapeoManualTipo(
    workbook: XLSX.WorkBook,
    tipo: TipoCargaCno,
    mapeoManual?: Record<string, string>,
  ): void {
    if (!mapeoManual || Object.keys(mapeoManual).length === 0) return;

    const definicion = DEFINICIONES_CNO[tipo];
    const ws = findSheet(workbook, [...definicion.hojas]);
    if (!ws || !ws['!ref']) return;

    const headerRow = findHeaderRow(ws);
    const range = XLSX.utils.decode_range(ws['!ref']);

    for (const [encabezadoCrudo, clave] of Object.entries(mapeoManual)) {
      const columna = definicion.columnas.find((c) => c.clave === clave);
      if (!columna) continue;

      const objetivo = normalizarEncabezado(encabezadoCrudo);
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: headerRow, c });
        const cell = ws[addr];
        if (cell?.v == null || normalizarEncabezado(cell.v) !== objetivo) continue;

        cell.v = columna.alias[0];
        cell.t = 's';
        if ('w' in cell) delete cell.w;
        break;
      }
    }
  }

  // ============================================================
  // Motor: transaccion por hoja + sincronizacion por lotes
  // ============================================================

  /**
   * Corre el cuerpo de una hoja dentro de su propia transaccion.
   *
   * Los errores de DATOS (un codigo que no existe, una fila incompleta) se acumulan
   * en `result.errors` sin lanzar, asi que la hoja commitea lo bueno. Solo un fallo
   * TECNICO llega hasta aqui como excepcion, y entonces se revierte la hoja entera:
   * los contadores se ponen en cero porque nada de lo que decia haber cargado quedo.
   */
  private async ejecutarHoja(
    sheet: string,
    tabla: string,
    cuerpo: (manager: EntityManager, result: SheetResult) => Promise<void>,
  ): Promise<SheetResult> {
    const result = newSheetResult(sheet, tabla);
    const iniciada = Date.now();

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await cuerpo(qr.manager, result);
      await qr.commitTransaction();
    } catch (err: any) {
      await qr.rollbackTransaction();
      result.inserted = 0;
      result.updated = 0;
      result.skipped = 0;
      result.skippedDetails = [];
      result.errors.push(`[${sheet}] La hoja completa se revirtio por un fallo tecnico: ${describeDbError(err)}`);
    } finally {
      await qr.release();
    }

    result.message = this.msg(result);
    this.logger.log(`${sheet}: ${result.message} (${this.formatElapsed(Date.now() - iniciada)})`);
    return result;
  }

  /**
   * Sincroniza una hoja cuya clave natural es un codigo unico (catalogos, ocupaciones,
   * funciones y denominaciones): crea las filas que no existen, actualiza las que
   * cambiaron y cuenta como omitidas las identicas. Todo se decide en memoria y se
   * vuelca en dos tandas de lotes.
   */
  /**
   * Deja constancia de una fila que `parsear` descarto sin explicar por que.
   *
   * Cuando `parsear` devuelve null suele ser porque ya reporto el motivo (la ocupacion
   * no existe, falta el registro del catalogo...). Pero tambien devuelve null cuando no
   * logra leer una columna obligatoria, y ese caso no dejaba ningun rastro: la fila
   * desaparecia y el cargue seguia informando "completado con exito". Asi fue como la
   * hoja de Funciones y la de Habilidades dejaron de cargarse por completo —8094 filas—
   * sin que el reporte lo delatara, hasta que se comparo el Excel contra la base a mano.
   *
   * Se distingue un caso del otro comparando cuantos errores habia antes de llamar a
   * `parsear`: si no agrego ninguno, el descarte fue mudo y aqui se cuenta como omitido.
   */
  private registrarDescarteSilencioso(result: SheetResult, fila: ExcelRow, erroresAntes: number): void {
    if (result.errors.length !== erroresAntes) return;

    result.unreadable++;
    result.skippedDetails.push(
      formatSkipDetail({
        sheet: result.sheet,
        excelRow: fila.excelRow,
        naturalKey: '(sin codigo legible)',
        reason:
          'No se pudo leer una columna obligatoria de esta fila: viene vacia o su encabezado ' +
          'no coincide con ninguno de los nombres que el cargue reconoce. La fila NO se cargo.',
      }),
    );
  }

  private async sincronizarPorCodigo<T extends object>(
    manager: EntityManager,
    result: SheetResult,
    entidad: EntityTarget<T>,
    filas: ExcelRow[],
    opciones: {
      claveDeEntidad: (entidad: T) => string;
      parsear: (fila: ExcelRow) => { clave: string; datos: DeepPartial<T>; nombre?: string } | null;
      aplicarCambios: (existente: T, datos: DeepPartial<T>) => boolean;
      motivoSinCambios: string;
      /**
       * Si true, los registros que existan en BD pero NO aparezcan en la hoja del
       * Excel se eliminan. Úsese solo en catálogos "maestros" (habilidades, conocimientos)
       * donde la plantilla es la fuente de verdad completa y no queremos arrastrar
       * datos de cargas anteriores que ya no están en el catálogo oficial.
       */
      eliminarHuerfanos?: boolean;
      filtroHuerfanos?: (huerfanos: T[]) => Promise<T[]>;
    },
  ): Promise<Set<string>> {
    const existentes = await manager.find(entidad);
    const porClave = new Map(existentes.map((e) => [opciones.claveDeEntidad(e), e]));

    const nuevos: DeepPartial<T>[] = [];
    const modificados: T[] = [];
    const clavesDeEstaHoja = new Set<string>();

    for (const fila of filas) {
      const erroresAntes = result.errors.length;
      const parsed = opciones.parsear(fila);
      if (!parsed) {
        this.registrarDescarteSilencioso(result, fila, erroresAntes);
        continue;
      }

      // Una clave repetida dentro de la misma hoja se procesaria dos veces y la
      // segunda chocaria contra la PK. Se avisa en vez de dejar que reviente.
      if (clavesDeEstaHoja.has(parsed.clave)) {
        result.warnings.push(
          `[${result.sheet} - fila ${fila.excelRow}] Codigo '${parsed.clave}' repetido en la hoja; ` +
            'solo se tuvo en cuenta su primera aparicion.',
        );
        continue;
      }
      clavesDeEstaHoja.add(parsed.clave);

      const existente = porClave.get(parsed.clave);
      if (!existente) {
        nuevos.push(parsed.datos);
        result.inserted++;
      } else if (opciones.aplicarCambios(existente, parsed.datos)) {
        modificados.push(existente);
        result.updated++;
      } else {
        result.skipped++;
        result.skippedDetails.push(
          formatSkipDetail({
            sheet: result.sheet,
            excelRow: fila.excelRow,
            naturalKey: parsed.clave,
            nombre: parsed.nombre,
            reason: opciones.motivoSinCambios,
          }),
        );
      }
    }

    await insertarEnLotes(manager, entidad, nuevos);
    await guardarEnLotes(manager, entidad, modificados);

    // Eliminar registros huérfanos (están en BD pero ya no aparecen en el Excel).
    if (opciones.eliminarHuerfanos) {
      let huerfanos = existentes.filter((e) => !clavesDeEstaHoja.has(opciones.claveDeEntidad(e)));
      if (opciones.filtroHuerfanos) {
        huerfanos = await opciones.filtroHuerfanos(huerfanos);
      }
      if (huerfanos.length > 0) {
        await manager.remove(entidad, huerfanos as any);
        result.warnings.push(
          `[${result.sheet}] Se eliminaron ${huerfanos.length} registro(s) que ya no aparecen en el Excel: ` +
            huerfanos.map((e) => opciones.claveDeEntidad(e)).join(', ') + '.',
        );
      }
    }

    return clavesDeEstaHoja;
  }

  /**
   * Desactiva (estado 0, sin borrar) las denominaciones o funciones que siguen en
   * la BD pero ya no vienen en el Excel, para que la base quede igual al Excel
   * oficial. Antes el cargue solo creaba y actualizaba: lo que se retiraba del
   * Excel seguía activo y se publicaba (p. ej. D-6371.003 y D-6371.005).
   *
   * Tres resguardos:
   *  - Solo toca ocupaciones que aparecen en la hoja: una hoja parcial no apaga
   *    el resto del catálogo, y las copias de Análisis (0011-24...) nunca vienen
   *    en el Excel, así que no se tocan.
   *  - Si la hoja tuvo errores o filas ilegibles no desactiva nada: una fila que
   *    no se pudo leer parecería "retirada" y se apagaría por error.
   *  - No borra: la correlativa referencia las denominaciones, y si el registro
   *    vuelve a venir en un Excel posterior, `aplicarCambios` lo reactiva.
   */
  private async inactivarAusentes(
    manager: EntityManager,
    result: SheetResult,
    opciones: {
      tabla: 'cno_denominacion' | 'cno_reg_funciones';
      columnaCodigo: string;
      columnaOcupacion: string;
      conFechaInactivacion: boolean;
      clavesHoja: Set<string>;
      ocupacionesHoja: Set<string>;
      descripcion: string;
    },
  ): Promise<void> {
    if (opciones.ocupacionesHoja.size === 0) return;
    if (result.errors.length > 0 || result.unreadable > 0) {
      result.warnings.push(
        `[${result.sheet}] No se desactivaron ${opciones.descripcion} ausentes del Excel porque la hoja tuvo ` +
          'errores o filas ilegibles; corrija el archivo y vuelva a cargarlo.',
      );
      return;
    }

    const fecha = opciones.conFechaInactivacion ? ', fecha_inactivacion = now()' : '';
    const filas: Array<{ codigo: string }> = await manager.query(
      `UPDATE clasificacion.${opciones.tabla}
          SET estado = 0${fecha}
        WHERE ${opciones.columnaOcupacion} = ANY($1::text[])
          AND COALESCE(estado, 1) <> 0
          AND NOT (${opciones.columnaCodigo} = ANY($2::text[]))
      RETURNING ${opciones.columnaCodigo} AS codigo`,
      [[...opciones.ocupacionesHoja], [...opciones.clavesHoja]],
    );
    // manager.query de UPDATE ... RETURNING en pg devuelve [filas, conteo].
    const desactivadas = (Array.isArray(filas[0]) ? filas[0] : filas) as Array<{ codigo: string }>;
    if (desactivadas.length > 0) {
      result.updated += desactivadas.length;
      result.changes.push(
        `[${result.sheet}] Se desactivaron ${desactivadas.length} ${opciones.descripcion} que ya no vienen en el Excel: ` +
          desactivadas.map((d) => d.codigo).join(', ') + '.',
      );
    }
  }

  /**
   * Crea filas de una tabla puente cuya clave es compuesta (ocupacion + relacionado)
   * y que no se actualiza nunca: si el par ya existe se omite. Tambien se vuelca por lotes.
   */
  private async crearRelacionesFaltantes<T extends object>(
    manager: EntityManager,
    result: SheetResult,
    entidad: EntityTarget<T>,
    filas: ExcelRow[],
    opciones: {
      clavesExistentes: Set<string>;
      parsear: (fila: ExcelRow) => { clave: string; datos: DeepPartial<T>; nombre?: string } | null;
      motivoDuplicado: string;
    },
  ): Promise<void> {
    const nuevos: DeepPartial<T>[] = [];
    const clavesVistas = new Set(opciones.clavesExistentes);

    for (const fila of filas) {
      const erroresAntes = result.errors.length;
      const parsed = opciones.parsear(fila);
      if (!parsed) {
        this.registrarDescarteSilencioso(result, fila, erroresAntes);
        continue;
      }

      if (clavesVistas.has(parsed.clave)) {
        result.skipped++;
        result.skippedDetails.push(
          formatSkipDetail({
            sheet: result.sheet,
            excelRow: fila.excelRow,
            naturalKey: parsed.clave,
            nombre: parsed.nombre,
            reason: opciones.motivoDuplicado,
          }),
        );
        continue;
      }
      clavesVistas.add(parsed.clave);
      nuevos.push(parsed.datos);
      result.inserted++;
    }

    await insertarEnLotes(manager, entidad, nuevos);
  }

  // ============================================================
  // 1. Area de desempeno (catalogo)
  // ============================================================

  private cargarAreaDesempeno(ws: XLSX.WorkSheet | undefined): Promise<SheetResult> {
    return this.ejecutarHoja('Area_desempeno', 'cno_area_desempeno', async (manager, result) => {
      if (!ws) {
        result.warnings.push('Pestana Area_desempeno no encontrada, se omite.');
        return;
      }
      await this.sincronizarPorCodigo(manager, result, CnoAreaDesempeno, sheetToRowsWithIndex(ws), {
        claveDeEntidad: (e) => e.codDesempeno,
        parsear: ({ row, excelRow }) => {
          const cod = getColumnCode(row, ['cod_desempeno_cno']);
          if (cod === null) return null;
          const nomDesempeno = getColumnStr(row, ['nom_desempeno_cno']);
          const descripcion = this.descripcionOpcional(result, 'Area_desempeno', excelRow, cod, getColumnStr(row, ['desc_desempeno_cno']));
          return { clave: cod, nombre: nomDesempeno, datos: { codDesempeno: cod, nomDesempeno, descripcion } };
        },
        aplicarCambios: (e, d) => {
          let changed = false;
          if (e.nomDesempeno !== d.nomDesempeno) { e.nomDesempeno = d.nomDesempeno as string; changed = true; }
          if (e.descripcion !== d.descripcion) { e.descripcion = d.descripcion as string; changed = true; }
          return changed;
        },
        motivoSinCambios: 'Ya existia en cno_area_desempeno con los mismos datos, no se modifico.',
      });
    });
  }

  // ============================================================
  // 2. Nivel de cualificacion (catalogo)
  // ============================================================

  private cargarNivelCualificacion(ws: XLSX.WorkSheet | undefined): Promise<SheetResult> {
    return this.ejecutarHoja('nivel_cualificacion', 'cno_nivel_cualificacion', async (manager, result) => {
      if (!ws) {
        result.warnings.push('Pestana nivel_cualificacion no encontrada, se omite.');
        return;
      }
      // El libro oficial (CNO_2026_Actualizado.xlsx) trae en esta hoja los nombres de
      // las ÁREAS en vez de los de los niveles. Un nombre que coincide con un área se
      // descarta: se conserva el nombre que ya tenga el nivel (migración 023) y solo
      // se actualiza la descripción, que sí es correcta.
      const nombresDeArea = new Set(
        (await manager.find(CnoAreaDesempeno)).map((a) => normalizeHeaderKey(a.nomDesempeno ?? '')),
      );
      const codigosConNombreDeArea = new Set<string>();

      await this.sincronizarPorCodigo(manager, result, CnoNivelCualificacion, sheetToRowsWithIndex(ws), {
        claveDeEntidad: (e) => e.codCualificacion,
        parsear: ({ row, excelRow }) => {
          const cod = getColumnCode(row, ['cod_cualificacion_cno']);
          if (cod === null) return null;
          // 'niveles_cualificacion_cno' es el encabezado actual de la hoja; 'nombre_cno'
          // el de los libros anteriores.
          const nombreHoja = getColumnStr(row, ['niveles_cualificacion_cno', 'nombre_cno']);
          const esNombreDeArea = nombresDeArea.has(normalizeHeaderKey(nombreHoja));
          if (esNombreDeArea) codigosConNombreDeArea.add(cod);
          if (esNombreDeArea && codigosConNombreDeArea.size === 1) {
            result.warnings.push(
              'La hoja nivel_cualificacion trae nombres de áreas de desempeño en la columna del nombre del nivel; ' +
                'se conservaron los nombres de nivel existentes y solo se actualizó la descripción.',
            );
          }
          const nivelesCualificacion = esNombreDeArea ? null : nombreHoja;
          const descripcion = this.descripcionOpcional(result, 'nivel_cualificacion', excelRow, cod, getColumnStr(row, ['descripcion']));
          return {
            clave: cod,
            nombre: nivelesCualificacion ?? undefined,
            // Sin nombre se usa el propio código: desde CNO 2026 ya es descriptivo («Nivel 1 (A)»).
            datos: { codCualificacion: cod, nivelesCualificacion: nivelesCualificacion ?? cod, descripcion },
          };
        },
        aplicarCambios: (e, d) => {
          let changed = false;
          const nombreValido = !codigosConNombreDeArea.has(e.codCualificacion);
          if (nombreValido && e.nivelesCualificacion !== d.nivelesCualificacion) { e.nivelesCualificacion = d.nivelesCualificacion as string; changed = true; }
          if (e.descripcion !== d.descripcion) { e.descripcion = d.descripcion as string; changed = true; }
          return changed;
        },
        motivoSinCambios: 'Ya existia en cno_nivel_cualificacion con los mismos datos, no se modifico.',
      });
    });
  }

  // ============================================================
  // 3. Funcion (catalogo)
  // ============================================================

  private cargarFuncionCatalogo(
    ws: XLSX.WorkSheet | undefined,
    wsRelacion: XLSX.WorkSheet | undefined,
  ): Promise<SheetResult> {
    return this.ejecutarHoja('Funcion', 'cno_funcion', async (manager, result) => {
      let filas: ReturnType<typeof sheetToRowsWithIndex>;
      let parsear: Parameters<typeof this.sincronizarPorCodigo<CnoFuncion>>[4]['parsear'];

      if (ws) {
        filas = sheetToRowsWithIndex(ws);
        parsear = ({ row }) => {
          const cod = getColumnCode(row, ['cod_funcion']);
          if (cod === null) return null;
          const descFuncionCno = getColumnStr(row, ['desc_funcion_cno']);
          return { clave: cod, datos: { codFuncion: cod, descFuncionCno } };
        };
      } else if (wsRelacion) {
        result.warnings.push(
          'Hoja "Funcion" no encontrada en el archivo; el catálogo se construye a partir de ' +
          '"Funciones - C.N.O." (primera aparición de cada función).',
        );
        const todasRelacion = sheetToRowsWithIndex(wsRelacion);
        const existentes = await manager.find(CnoFuncion);
        const mapPorDesc = new Map<string, string>();
        let maxNum = 0;
        for (const f of existentes) {
          if (f.descFuncionCno) mapPorDesc.set(f.descFuncionCno.trim().toLowerCase(), f.codFuncion);
          const m = f.codFuncion?.match(/^F-(\d+)$/i);
          if (m) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n) && n > maxNum) maxNum = n;
          }
        }

        const unicas: typeof todasRelacion = [];
        const vistasDesc = new Set<string>();

        for (const fila of todasRelacion) {
          const desc = getColumnStr(fila.row, [
            'descripcion de la funcion - c.n.o.',
            'desc_funcion_cno',
          ]).trim();
          if (!desc) continue;
          const k = desc.toLowerCase();
          if (!vistasDesc.has(k)) {
            vistasDesc.add(k);
            let cod = mapPorDesc.get(k);
            if (!cod) {
              maxNum++;
              cod = `F-${String(maxNum).padStart(2, '0')}`;
              mapPorDesc.set(k, cod);
            }
            fila.row['__generated_cod_funcion'] = cod;
            fila.row['__clean_desc_funcion'] = desc;
            unicas.push(fila);
          }
        }
        filas = unicas;
        parsear = ({ row }) => {
          const cod = (row['__generated_cod_funcion'] as string) || getColumnCode(row, ['cod_funcion']);
          if (!cod) return null;
          const descFuncionCno = (row['__clean_desc_funcion'] as string) || getColumnStr(row, ['desc_funcion_cno']);
          return { clave: cod, datos: { codFuncion: cod, descFuncionCno } };
        };
      } else {
        result.warnings.push('Ni hoja "Funcion" ni hoja "Funciones - C.N.O." encontradas; se omite el catálogo de funciones.');
        return;
      }

      await this.sincronizarPorCodigo(manager, result, CnoFuncion, filas, {
        claveDeEntidad: (e) => e.codFuncion,
        parsear,
        aplicarCambios: (e, d) => {
          if (e.descFuncionCno === d.descFuncionCno) return false;
          e.descFuncionCno = d.descFuncionCno as string;
          return true;
        },
        motivoSinCambios: 'Ya existia en cno_funcion con la misma descripcion, no se modifico.',
      });
    });
  }

  // ============================================================
  // 4. Habilidad (catalogo) — hoja "Habilidad" -> habilidad_destreza
  //    Si la hoja "Habilidad" no está, el catálogo se construye de
  //    los únicos código+nombre que aparezcan en "Habilidades - C.N.O."
  // ============================================================

  private cargarHabilidadCatalogo(
    ws: XLSX.WorkSheet | undefined,
    wsRelacion: XLSX.WorkSheet | undefined,
  ): Promise<SheetResult> {
    return this.ejecutarHoja('Habilidad', 'habilidad_destreza', async (manager, result) => {
      let filas: ReturnType<typeof sheetToRowsWithIndex>;
      let parsear: Parameters<typeof this.sincronizarPorCodigo<HabilidadDestreza>>[4]['parsear'];

      if (ws) {
        // Hoja propia de catálogo (formato antiguo con columnas cod_hab_dest / nomb_hab_dest)
        filas = sheetToRowsWithIndex(ws);
        parsear = ({ row, excelRow }) => {
          const cod = getColumnInt(row, ['cod_hab_dest']);
          if (cod === null) return null;
          const nombHabDest = getColumnStr(row, ['nomb_hab_dest']);
          const descHabDest = this.descripcionOpcional(result, 'Habilidad', excelRow, String(cod), getColumnStr(row, ['desc_hab_dest']));
          return { clave: String(cod), nombre: nombHabDest, datos: { codHabDest: cod, nombHabDest, descHabDest } };
        };
      } else if (wsRelacion) {
        // Sin hoja propia: deduplicar el catálogo desde la hoja de relaciones.
        // Cada fila de 'Habilidades - C.N.O.' contiene código + nombre + descripción
        // de la habilidad; basta con quedarse con la primera aparición de cada código.
        result.warnings.push(
          'Hoja "Habilidad" no encontrada en el archivo; el catálogo se construye a partir de ' +
          '"Habilidades - C.N.O." (primera aparición de cada código).',
        );
        const todasRelacion = sheetToRowsWithIndex(wsRelacion);
        const vistos = new Set<number>();
        const unicas: typeof todasRelacion = [];
        for (const fila of todasRelacion) {
          const cod = getColumnInt(fila.row, ['codigo de la habilidad - c.n.o.']);
          if (cod !== null && !vistos.has(cod)) {
            vistos.add(cod);
            unicas.push(fila);
          }
        }
        filas = unicas;
        parsear = ({ row, excelRow }) => {
          const cod = getColumnInt(row, ['codigo de la habilidad - c.n.o.']);
          if (cod === null) return null;
          const nombHabDest = getColumnStr(row, ['nombre de la habilidad - c.n.o.']);
          const descHabDest = this.descripcionOpcional(
            result, 'Habilidad', excelRow, String(cod),
            getColumnStr(row, ['descripcion de la habilidad - c.n.o.']),
          );
          return { clave: String(cod), nombre: nombHabDest, datos: { codHabDest: cod, nombHabDest, descHabDest } };
        };
      } else {
        result.warnings.push('Ni hoja "Habilidad" ni hoja "Habilidades - C.N.O." encontradas; se omite el catálogo de habilidades.');
        return;
      }

      await this.sincronizarPorCodigo(manager, result, HabilidadDestreza, filas, {
        claveDeEntidad: (e) => String(e.codHabDest),
        parsear,
        aplicarCambios: (e, d) => {
          let changed = false;
          if (e.nombHabDest !== d.nombHabDest) { e.nombHabDest = d.nombHabDest as string; changed = true; }
          if (e.descHabDest !== d.descHabDest) { e.descHabDest = d.descHabDest as string; changed = true; }
          return changed;
        },
        motivoSinCambios: 'Ya existia en habilidad_destreza con los mismos datos, no se modifico.',
        eliminarHuerfanos: true,
        filtroHuerfanos: async (huerfanos) => {
          // No intentar borrar habilidades que pertenezcan o estén referenciadas en CUOC
          const cuocRefs = await manager.query(
            'SELECT DISTINCT codigo_destreza FROM clasificacion.cuoc_destreza',
          );
          const cuocSet = new Set(cuocRefs.map((r: any) => String(r.codigo_destreza)));
          const aEliminar = huerfanos.filter((h) => !cuocSet.has(String(h.codHabDest)));
          if (aEliminar.length > 0) {
            const ids = aEliminar.map((h) => h.codHabDest);
            await manager.query(
              `DELETE FROM clasificacion.cno_reg_habilidad WHERE codigo_habilidad = ANY($1)`,
              [ids],
            );
          }
          return aEliminar;
        },
      });
      await resincronizarSecuencia(manager, 'habilidad_destreza', 'cod_hab_dest');
    });
  }

  // ============================================================
  // 5. Conocimiento (catalogo) — hoja "Nivel de conocimiento" -> cno_conocimiento
  //    Si la hoja "Nivel de conocimiento" no está, el catálogo se construye de
  //    los únicos código+nombre que aparezcan en "Conocimientos - C.N.O."
  // ============================================================

  private cargarConocimientoCatalogo(
    ws: XLSX.WorkSheet | undefined,
    wsRelacion: XLSX.WorkSheet | undefined,
  ): Promise<SheetResult> {
    return this.ejecutarHoja('Nivel de conocimiento', 'cno_conocimiento', async (manager, result) => {
      let filas: ReturnType<typeof sheetToRowsWithIndex>;
      let parsear: Parameters<typeof this.sincronizarPorCodigo<CnoConocimiento>>[4]['parsear'];

      if (ws) {
        // Hoja propia de catálogo (formato antiguo)
        filas = sheetToRowsWithIndex(ws);
        parsear = ({ row, excelRow }) => {
          const cod = getColumnInt(row, ['cod_conocimiento_cno']);
          if (cod === null) return null;
          const nombConocimiento = getColumnStr(row, ['nomb_conocimiento_cno']);
          const descConocimiento = this.descripcionOpcional(result, 'Nivel de conocimiento', excelRow, String(cod), getColumnStr(row, ['desc_conocimiento_cno']));
          return { clave: String(cod), nombre: nombConocimiento, datos: { codConocimiento: cod, nombConocimiento, descConocimiento } };
        };
      } else if (wsRelacion) {
        // Sin hoja propia: deduplicar el catálogo desde la hoja de relaciones.
        result.warnings.push(
          'Hoja "Nivel de conocimiento" no encontrada en el archivo; el catálogo se construye a partir de ' +
          '"Conocimientos - C.N.O." (primera aparición de cada código).',
        );
        const todasRelacion = sheetToRowsWithIndex(wsRelacion);
        const vistos = new Set<number>();
        const unicas: typeof todasRelacion = [];
        for (const fila of todasRelacion) {
          const cod = getColumnInt(fila.row, ['codigo del conocimiento - c.n.o.']);
          if (cod !== null && !vistos.has(cod)) {
            vistos.add(cod);
            unicas.push(fila);
          }
        }
        filas = unicas;
        parsear = ({ row, excelRow }) => {
          const cod = getColumnInt(row, ['codigo del conocimiento - c.n.o.']);
          if (cod === null) return null;
          const nombConocimiento = getColumnStr(row, ['nombre del conocimiento - c.n.o.']);
          const descConocimiento = this.descripcionOpcional(
            result, 'Nivel de conocimiento', excelRow, String(cod),
            getColumnStr(row, ['descripcion del conocimiento - c.n.o.']),
          );
          return { clave: String(cod), nombre: nombConocimiento, datos: { codConocimiento: cod, nombConocimiento, descConocimiento } };
        };
      } else {
        result.warnings.push('Ni hoja "Nivel de conocimiento" ni hoja "Conocimientos - C.N.O." encontradas; se omite el catálogo de conocimientos.');
        return;
      }

      await this.sincronizarPorCodigo(manager, result, CnoConocimiento, filas, {
        claveDeEntidad: (e) => String(e.codConocimiento),
        parsear,
        aplicarCambios: (e, d) => {
          let changed = false;
          if (e.nombConocimiento !== d.nombConocimiento) { e.nombConocimiento = d.nombConocimiento as string; changed = true; }
          if (e.descConocimiento !== d.descConocimiento) { e.descConocimiento = d.descConocimiento as string; changed = true; }
          return changed;
        },
        motivoSinCambios: 'Ya existia en cno_conocimiento con los mismos datos, no se modifico.',
        eliminarHuerfanos: true,
      });
      await resincronizarSecuencia(manager, 'cno_conocimiento', 'cod_conocimiento');
    });
  }

  // ============================================================
  // 6. Ocupaciones
  // ============================================================

  private cargarOcupaciones(ws: XLSX.WorkSheet): Promise<SheetResult> {
    return this.ejecutarHoja('Ocupaciones', 'cno_ocupacion', async (manager, result) => {
      // Secuencial y no Promise.all: estas consultas corren dentro de la transaccion
      // de la hoja, que usa una sola conexion y no admite queries simultaneas.
      const areas = await manager.find(CnoAreaDesempeno);
      const niveles = await manager.find(CnoNivelCualificacion);
      const areaMap = new Map(areas.map((a) => [a.codDesempeno, a]));
      const nivelMap = new Map(niveles.map((n) => [n.codCualificacion, n]));
      // sincronizarPorCodigo carga las ocupaciones sin relaciones, así que el área
      // y el nivel actuales se leen aparte para poder compararlos.
      const fksActuales: Array<{ cod: string; area: string | null; nivel: string | null }> = await manager.query(
        'SELECT cod_ocupacion_cno AS cod, cod_desempeno_cno AS area, cod_cualificacion_cno AS nivel FROM cno_ocupacion',
      );
      const fkPorCodigo = new Map(fksActuales.map((f) => [f.cod, f]));

      await this.sincronizarPorCodigo(manager, result, CnoOcupacion, sheetToRowsWithIndex(ws), {
        claveDeEntidad: (e) => e.codOcupacionCno,
        parsear: ({ row, excelRow }) => {
          const cod = getColumnCode(row, ['cod_ocupacion_cno']);
          if (cod === null) return null;
          const nombOcupacionCno = getColumnStr(row, ['nomb_ocupacion_cno']);
          const descripcion = getColumnStr(row, ['desc_ocupacion_cno']) || null;
          const estado = parseBooleanFlag(getColumn(row, ['estado', 'activa_ocupacion_cno']));

          // getColumnCode y no getColumnInt: areaMap/nivelMap estan indexados por el codigo
          // tal cual se guardo (tambien via getColumnCode), y un codigo "05" convertido a "5"
          // no encontraria su area/nivel. Como ambas columnas son NOT NULL con FK, eso hacia
          // fallar la ocupacion entera y, en cascada, todas sus filas relacionadas.
          // 'cod_desempeno_cno' es el encabezado actual ('cod_desempeño_cno' en el Excel;
          // normalizeHeaderKey le quita la tilde de la n antes de comparar). 'cod_desempe_cno'
          // se conserva como alias por los libros anteriores. Sin el alias correcto la columna
          // llegaba nula y, como es NOT NULL, reventaba la hoja Ocupaciones entera y con ella
          // todas las hojas de relaciones que dependen de que las ocupaciones existan.
          const codDesempeno = getColumnCode(row, ['cod_desempeno_cno', 'cod_desempe_cno']);
          const codCualificacion = getColumnCode(row, ['cod_cualificacion_cno']);
          // getColumnCode y no getColumnStr: son codigos con ceros a la izquierda ("001")
          // que como numero perderian el cero. La columna existe en BD y el listado de CNO
          // ya la muestra, pero el cargue nunca la leia y salia '-' en las 611 ocupaciones.
          const campoOcupCno = getColumnCode(row, ['campo_ocupacional', 'campo_ocup_cno']);
          // Nombre del campo ocupacional (libro CNO 2026). Viene con espacios de no
          // separación alrededor; getColumnStr los recorta con trim().
          const descCampoOcupCno = getColumnStr(row, ['descripcion_campo', 'desc_campo_ocup_cno']) || null;
          // Columnas del ciclo de vida que traen algunos libros (p. ej. 2CNO_2024).
          // Solo se aplican si la celda tiene valor: una celda vacía no borra lo
          // que ya esté registrado en la base.
          const fechaRegistro = getColumnFecha(row, ['fecha_registro', 'fecha de registro']);
          const fechaInactivacion = getColumnFecha(row, ['fecha_inactivacion', 'fecha de inactivacion']);
          const trazabilidad = getColumnStr(row, ['trazabilidad']) || null;
          const codAnte = getColumnCode(row, ['cod_ante_ocupacion_cno', 'codigo_anterior', 'codigo anterior']);
          const areaEntity = codDesempeno !== null ? areaMap.get(codDesempeno) : undefined;
          const nivelEntity = codCualificacion !== null ? nivelMap.get(codCualificacion) : undefined;

          if (codDesempeno !== null && !areaEntity) {
            result.errors.push(formatImportError({
              sheet: 'Ocupaciones', excelRow, operation: 'sincronizar ocupacion',
              ocupacionCodigo: cod, ocupacionNombre: nombOcupacionCno,
              originalMessage: `Area de desempeno con codigo '${codDesempeno}' no encontrada en cno_area_desempeno; la columna es obligatoria en BD, esta fila no se pudo insertar.`,
            }));
            return null;
          }
          if (codCualificacion !== null && !nivelEntity) {
            result.errors.push(formatImportError({
              sheet: 'Ocupaciones', excelRow, operation: 'sincronizar ocupacion',
              ocupacionCodigo: cod, ocupacionNombre: nombOcupacionCno,
              originalMessage: `Nivel de cualificacion con codigo '${codCualificacion}' no encontrado en cno_nivel_cualificacion; la columna es obligatoria en BD, esta fila no se pudo insertar.`,
            }));
            return null;
          }

          return {
            clave: cod,
            nombre: nombOcupacionCno,
            datos: {
              codOcupacionCno: cod,
              nombOcupacionCno,
              descripcion,
              nomDesempeno: areaEntity?.nomDesempeno ?? null,
              nivelesCualificacion: nivelEntity?.nivelesCualificacion ?? null,
              campoOcupCno,
              descCampoOcupCno,
              estado,
              // Solo lo que traiga el Excel; sin valor la columna queda vacía.
              fechaRegistro: (fechaRegistro ?? undefined) as any,
              fechaInactivacion: (fechaInactivacion ?? undefined) as any,
              trazabilidad: trazabilidad ?? undefined,
              codAnteOcupacionCno: codAnte ?? undefined,
              areaDesempeno: areaEntity,
              nivelCualificacion: nivelEntity,
            },
          };
        },
        aplicarCambios: (e, d) => {
          let changed = false;
          if (e.nombOcupacionCno !== d.nombOcupacionCno) { e.nombOcupacionCno = d.nombOcupacionCno as string; changed = true; }
          if (e.descripcion !== d.descripcion) { e.descripcion = d.descripcion as string; changed = true; }
          if (e.nomDesempeno !== d.nomDesempeno) { e.nomDesempeno = d.nomDesempeno as string; changed = true; }
          if (e.nivelesCualificacion !== d.nivelesCualificacion) { e.nivelesCualificacion = d.nivelesCualificacion as string; changed = true; }
          if (e.campoOcupCno !== d.campoOcupCno) { e.campoOcupCno = d.campoOcupCno as string; changed = true; }
          if ((e.descCampoOcupCno ?? null) !== d.descCampoOcupCno) { e.descCampoOcupCno = d.descCampoOcupCno as string | null; changed = true; }
          if (e.estado !== d.estado) { e.estado = d.estado as boolean; changed = true; }
          // Fechas (la columna DATE llega como 'YYYY-MM-DD'), trazabilidad y código
          // anterior: solo si el Excel trae valor y difiere del registrado.
          const fechaActual = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v as string | null) ?? null);
          // Las fechas salen SOLO del Excel: si la hoja no las trae no se pone
          // ninguna y se conserva la que ya hubiera.
          if (d.fechaRegistro && fechaActual(e.fechaRegistro) !== d.fechaRegistro) { e.fechaRegistro = d.fechaRegistro as any; changed = true; }
          if (d.fechaInactivacion && fechaActual(e.fechaInactivacion) !== d.fechaInactivacion) { e.fechaInactivacion = d.fechaInactivacion as any; changed = true; }
          if (d.trazabilidad && e.trazabilidad !== d.trazabilidad) { e.trazabilidad = d.trazabilidad as string; changed = true; }
          if (d.codAnteOcupacionCno && e.codAnteOcupacionCno !== d.codAnteOcupacionCno) { e.codAnteOcupacionCno = d.codAnteOcupacionCno as string; changed = true; }
          // Antes solo se actualizaba el texto del área/nivel y no la relación: las
          // ocupaciones cargadas con área y nivel equivocados nunca se corregían al
          // volver a subir el Excel (591 quedaron en área 1 / nivel 1).
          const fk = fkPorCodigo.get(e.codOcupacionCno);
          const area = d.areaDesempeno as CnoAreaDesempeno | undefined;
          const nivel = d.nivelCualificacion as CnoNivelCualificacion | undefined;
          if (area && fk?.area !== area.codDesempeno) { e.areaDesempeno = area; changed = true; }
          if (nivel && fk?.nivel !== nivel.codCualificacion) { e.nivelCualificacion = nivel; changed = true; }
          return changed;
        },
        motivoSinCambios: 'Ya existia en cno_ocupacion con los mismos datos (nombre, descripcion, area, nivel, campo ocupacional y su descripcion, y estado), no se modifico.',
      });
    });
  }

  // ============================================================
  // 7. Funciones (relacion con codigo propio)
  // ============================================================

  private cargarFuncionesRelacion(ws: XLSX.WorkSheet): Promise<SheetResult> {
    return this.ejecutarHoja('Funciones - C.N.O.', 'cno_reg_funciones', async (manager, result) => {
      const ocupaciones = await manager.find(CnoOcupacion);
      const funciones = await manager.find(CnoFuncion);
      const ocupacionSet = new Set(ocupaciones.map((o) => o.codOcupacionCno));
      const funcionSet = new Set(funciones.map((f) => f.codFuncion));
      const funcionMapByDesc = new Map(funciones.map((f) => [normalizeHeaderKey(f.descFuncionCno || ''), f]));
      const ocupacionesHoja = new Set<string>();

      const clavesHoja = await this.sincronizarPorCodigo(manager, result, CnoRegFunciones, sheetToRowsWithIndex(ws), {
        claveDeEntidad: (e) => e.codigo,
        parsear: ({ row, excelRow }) => {
          const codigo = getColumnCode(row, [
            'codigo de la funcion - c.n.o.',
            'cod_funcion_cno',
            'codigo',
          ]);
          const codOcupacion = getColumnCode(row, [
            'codigo de la ocupacion - c.n.o.',
            'cod_ocupacion_cno',
          ]);
          if (codigo === null || codOcupacion === null) return null;

          const descFuncionCno = getColumnStr(row, [
            'descripcion de la funcion - c.n.o.',
            'desc_funcion_cno',
          ]);

          let codFuncion = getColumnCode(row, ['cod_funcion']);
          if (!codFuncion && descFuncionCno) {
            codFuncion = funcionMapByDesc.get(normalizeHeaderKey(descFuncionCno))?.codFuncion ?? null;
          }
          if (!codFuncion) {
            codFuncion = funcionSet.has(codigo) ? codigo : null;
          }
          if (codFuncion === null) return null;

          if (!ocupacionSet.has(codOcupacion)) {
            result.errors.push(formatImportError({
              sheet: 'Funciones - C.N.O.', excelRow, operation: 'crear relacion funcion',
              ocupacionCodigo: codOcupacion, relatedCodigo: codFuncion,
              originalMessage: `Ocupacion con codigo '${codOcupacion}' no encontrada en cno_ocupacion.`,
            }));
            return null;
          }
          if (!funcionSet.has(codFuncion)) {
            result.errors.push(formatImportError({
              sheet: 'Funciones - C.N.O.', excelRow, operation: 'crear relacion funcion',
              ocupacionCodigo: codOcupacion, relatedCodigo: codFuncion,
              originalMessage: `Funcion con codigo '${codFuncion}' no encontrada en cno_funcion (catalogo).`,
            }));
            return null;
          }

          ocupacionesHoja.add(codOcupacion);
          return {
            clave: codigo,
            datos: {
              codigo,
              descFuncionCno,
              estado: parseBooleanFlag(getColumn(row, ['activa_funcion_cno', 'estado'])) ? 1 : 0,
              ocupacion: { codOcupacionCno: codOcupacion } as CnoOcupacion,
              funcion: { codFuncion } as CnoFuncion,
            },
          };
        },
        aplicarCambios: (e, d) => {
          let changed = false;
          if (e.descFuncionCno !== d.descFuncionCno) { e.descFuncionCno = d.descFuncionCno as string; changed = true; }
          if (e.estado !== d.estado) { e.estado = d.estado as number; changed = true; }
          return changed;
        },
        motivoSinCambios: 'Ya existia la relacion ocupacion-funcion con los mismos datos, no se modifico.',
      });

      await this.inactivarAusentes(manager, result, {
        tabla: 'cno_reg_funciones',
        columnaCodigo: 'codigo',
        columnaOcupacion: 'cno_ocupacion',
        conFechaInactivacion: false,
        clavesHoja,
        ocupacionesHoja,
        descripcion: 'funciones',
      });
    });
  }

  // ============================================================
  // 8. Denominaciones
  // ============================================================

  private cargarDenominaciones(ws: XLSX.WorkSheet): Promise<SheetResult> {
    return this.ejecutarHoja('Denominaciones - C.N.O.', 'cno_denominacion', async (manager, result) => {
      const ocupacionSet = new Set((await manager.find(CnoOcupacion)).map((o) => o.codOcupacionCno));
      const ocupacionesHoja = new Set<string>();

      const clavesHoja = await this.sincronizarPorCodigo(manager, result, CnoDenominacion, sheetToRowsWithIndex(ws), {
        claveDeEntidad: (e) => e.codDenominacionCno,
        parsear: ({ row, excelRow }) => {
          const codDenominacion = getColumnCode(row, [
            'codigo de la denominacion - c.n.o.',
            'cod_denominacion_cno',
          ]);
          const codOcupacion = getColumnCode(row, [
            'codigo de la ocupacion - c.n.o.',
            'cod_ocupacion_cno',
          ]);
          if (codDenominacion === null || codOcupacion === null) return null;

          const descDenominacion = getColumnStr(row, [
            'descripcion de la denominacion - c.n.o.',
            'desc_denominacion_cno',
            'desc_denominacion',
          ]);
          if (!ocupacionSet.has(codOcupacion)) {
            result.errors.push(formatImportError({
              sheet: 'Denominaciones - C.N.O.', excelRow, operation: 'crear denominacion',
              ocupacionCodigo: codOcupacion, relatedCodigo: codDenominacion, relatedNombre: descDenominacion,
              originalMessage: `Ocupacion con codigo '${codOcupacion}' no encontrada en cno_ocupacion.`,
            }));
            return null;
          }

          ocupacionesHoja.add(codOcupacion);
          return {
            clave: codDenominacion,
            nombre: descDenominacion,
            datos: {
              codDenominacionCno: codDenominacion,
              descDenominacion,
              estado: parseBooleanFlag(getColumn(row, ['activa_denominacion_cno', 'estado'])) ? 1 : 0,
              ocupacion: { codOcupacionCno: codOcupacion } as CnoOcupacion,
            },
          };
        },
        aplicarCambios: (e, d) => {
          let changed = false;
          if (e.descDenominacion !== d.descDenominacion) { e.descDenominacion = d.descDenominacion as string; changed = true; }
          if (e.estado !== d.estado) { e.estado = d.estado as number; changed = true; }
          return changed;
        },
        motivoSinCambios: 'Ya existia la denominacion con los mismos datos, no se modifico.',
      });

      await this.inactivarAusentes(manager, result, {
        tabla: 'cno_denominacion',
        columnaCodigo: 'cod_denominacion_cno',
        columnaOcupacion: 'cno_cod_ocupacion',
        conFechaInactivacion: true,
        clavesHoja,
        ocupacionesHoja,
        descripcion: 'denominaciones',
      });
    });
  }

  // ============================================================
  // 9. Relacionadas (tabla puente ocupacion <-> ocupacion)
  // ============================================================

  private cargarRelacionadas(ws: XLSX.WorkSheet): Promise<SheetResult> {
    return this.ejecutarHoja('Relacionadas - C.N.O.', 'cno_relacionadas', async (manager, result) => {
      const ocupaciones = await manager.find(CnoOcupacion);
      const ocupacionSet = new Set(ocupaciones.map((o) => o.codOcupacionCno));
      const existentes: any[] = await manager.query(
        'SELECT cod_ocupacion_cno, codigo_ocupacion FROM clasificacion.cno_relacionadas',
      );

      await this.crearRelacionesFaltantes(manager, result, CnoRelacionada, sheetToRowsWithIndex(ws), {
        clavesExistentes: new Set(existentes.map((r) => buildKey(r.cod_ocupacion_cno, r.codigo_ocupacion ?? ''))),
        parsear: ({ row, excelRow }) => {
          const codOcupacion = getColumnCode(row, ['codigo de la ocupacion - c.n.o.']);
          const codRelacionada = getColumnCode(row, ['codigo de la ocupacion relacionada - c.n.o.']);
          if (codOcupacion === null || codRelacionada === null) return null;

          const nombreOcupacion = getColumnStr(row, ['nombre de la ocupacion - c.n.o.']);
          const nombreRelacionada = getColumnStr(row, ['nombre de la ocupacion relacionada - c.n.o.']);

          for (const [codigo, etiqueta] of [[codOcupacion, 'origen'], [codRelacionada, 'relacionada']] as const) {
            if (!ocupacionSet.has(codigo)) {
              result.errors.push(formatImportError({
                sheet: 'Relacionadas - C.N.O.', excelRow, operation: 'crear ocupacion relacionada',
                ocupacionCodigo: codOcupacion, ocupacionNombre: nombreOcupacion,
                relatedCodigo: codRelacionada, relatedNombre: nombreRelacionada,
                originalMessage: `Ocupacion ${etiqueta} con codigo '${codigo}' no encontrada en cno_ocupacion.`,
              }));
              return null;
            }
          }

          return {
            clave: buildKey(codOcupacion, codRelacionada),
            nombre: nombreRelacionada,
            datos: {
              nombreOcupacion,
              codigoOcupacion: codRelacionada,
              nombreCnoRelacionada: nombreRelacionada,
              ocupacion: { codOcupacionCno: codOcupacion } as CnoOcupacion,
            },
          };
        },
        motivoDuplicado: 'La relacion entre estas dos ocupaciones ya existia, no se duplico.',
      });
    });
  }

  // ============================================================
  // 10. Habilidades (relacion) — hoja "Habilidades - C.N.O." -> cno_reg_habilidad
  // ============================================================

  private cargarHabilidadesRelacion(ws: XLSX.WorkSheet): Promise<SheetResult> {
    return this.ejecutarHoja('Habilidades - C.N.O.', 'cno_reg_habilidad', async (manager, result) => {
      const ocupacionSet = new Set((await manager.find(CnoOcupacion)).map((o) => o.codOcupacionCno));
      const catalogo = new Map((await manager.find(HabilidadDestreza)).map((h) => [h.codHabDest, h]));
      const existentes: any[] = await manager.query(
        'SELECT cod_ocupacion_cno, codigo_habilidad FROM clasificacion.cno_reg_habilidad',
      );

      await this.crearRelacionesFaltantes(manager, result, CnoRegHabilidad, sheetToRowsWithIndex(ws), {
        clavesExistentes: new Set(existentes.map((r) => buildKey(r.cod_ocupacion_cno, r.codigo_habilidad))),
        parsear: ({ row, excelRow }) => {
          // En esta hoja la ocupacion viene como 'Codigo de la ocupacion - C.N.O.', igual
          // que en Conocimientos/Relacionadas, no como 'cod_ocupacion_cno'. Con el alias
          // viejo quedaba null y las ~3100 filas se descartaban sin dejar rastro.
          const codOcupacion = getColumnCode(row, ['codigo de la ocupacion - c.n.o.', 'cod_ocupacion_cno']);
          const codHabilidad = getColumnInt(row, ['codigo de la habilidad - c.n.o.']);
          if (codOcupacion === null || codHabilidad === null) return null;

          const nombreEnHoja = getColumnStr(row, ['nombre de la habilidad - c.n.o.']);

          if (!ocupacionSet.has(codOcupacion)) {
            result.errors.push(formatImportError({
              sheet: 'Habilidades - C.N.O.', excelRow, operation: 'crear relacion habilidad',
              ocupacionCodigo: codOcupacion, relatedCodigo: String(codHabilidad), relatedNombre: nombreEnHoja,
              originalMessage: `Ocupacion con codigo '${codOcupacion}' no encontrada en cno_ocupacion.`,
            }));
            return null;
          }
          const habilidad = catalogo.get(codHabilidad);
          if (!habilidad) {
            result.errors.push(formatImportError({
              sheet: 'Habilidades - C.N.O.', excelRow, operation: 'crear relacion habilidad',
              ocupacionCodigo: codOcupacion, relatedCodigo: String(codHabilidad), relatedNombre: nombreEnHoja,
              originalMessage: `Habilidad con codigo '${codHabilidad}' no encontrada en habilidad_destreza (catalogo).`,
            }));
            return null;
          }

          this.avisarNombreDivergente(result, 'Habilidades - C.N.O.', excelRow, String(codHabilidad), nombreEnHoja, habilidad.nombHabDest);

          return {
            clave: buildKey(codOcupacion, codHabilidad),
            nombre: habilidad.nombHabDest,
            datos: {
              // El nombre sale del catalogo, no de la hoja de relacion: el catalogo es la
              // unica fuente de verdad. Si la hoja trae otro, queda avisado arriba.
              nombHabDest: habilidad.nombHabDest,
              habilidadDestreza: { codHabDest: codHabilidad } as HabilidadDestreza,
              ocupacion: { codOcupacionCno: codOcupacion } as CnoOcupacion,
            },
          };
        },
        motivoDuplicado: 'La relacion ocupacion-habilidad ya existia, no se duplico.',
      });
    });
  }

  // ============================================================
  // 11. Conocimientos (relacion) — hoja "Conocimientos - C.N.O." -> cno_reg_conocimiento
  // ============================================================

  private cargarConocimientosRelacion(ws: XLSX.WorkSheet): Promise<SheetResult> {
    return this.ejecutarHoja('Conocimientos - C.N.O.', 'cno_reg_conocimiento', async (manager, result) => {
      const ocupacionSet = new Set((await manager.find(CnoOcupacion)).map((o) => o.codOcupacionCno));
      const catalogo = new Map((await manager.find(CnoConocimiento)).map((c) => [c.codConocimiento, c]));
      const existentes: any[] = await manager.query(
        'SELECT cod_ocupacion_cno, cod_conocimiento FROM clasificacion.cno_reg_conocimiento',
      );

      await this.crearRelacionesFaltantes(manager, result, CnoRegConocimiento, sheetToRowsWithIndex(ws), {
        clavesExistentes: new Set(existentes.map((r) => buildKey(r.cod_ocupacion_cno, r.cod_conocimiento))),
        parsear: ({ row, excelRow }) => {
          const codOcupacion = getColumnCode(row, ['codigo de la ocupacion - c.n.o.']);
          const codConocimiento = getColumnInt(row, ['codigo del conocimiento - c.n.o.']);
          if (codOcupacion === null || codConocimiento === null) return null;

          const nombreEnHoja = getColumnStr(row, ['nombre del conocimiento - c.n.o.']);

          if (!ocupacionSet.has(codOcupacion)) {
            result.errors.push(formatImportError({
              sheet: 'Conocimientos - C.N.O.', excelRow, operation: 'crear relacion conocimiento',
              ocupacionCodigo: codOcupacion, relatedCodigo: String(codConocimiento), relatedNombre: nombreEnHoja,
              originalMessage: `Ocupacion con codigo '${codOcupacion}' no encontrada en cno_ocupacion.`,
            }));
            return null;
          }
          // Esta hoja YA NO crea entradas de catalogo: si el codigo no existe en
          // cno_conocimiento (que se carga desde "Nivel de conocimiento"), es un error
          // de la plantilla y se reporta, no se inventa la ficha.
          const conocimiento = catalogo.get(codConocimiento);
          if (!conocimiento) {
            result.errors.push(formatImportError({
              sheet: 'Conocimientos - C.N.O.', excelRow, operation: 'crear relacion conocimiento',
              ocupacionCodigo: codOcupacion, relatedCodigo: String(codConocimiento), relatedNombre: nombreEnHoja,
              originalMessage: `Conocimiento con codigo '${codConocimiento}' no encontrado en cno_conocimiento (catalogo, hoja "Nivel de conocimiento").`,
            }));
            return null;
          }

          this.avisarNombreDivergente(result, 'Conocimientos - C.N.O.', excelRow, String(codConocimiento), nombreEnHoja, conocimiento.nombConocimiento);

          return {
            clave: buildKey(codOcupacion, codConocimiento),
            nombre: conocimiento.nombConocimiento,
            datos: {
              nombConocimiento: conocimiento.nombConocimiento,
              conocimiento: { codConocimiento } as CnoConocimiento,
              ocupacion: { codOcupacionCno: codOcupacion } as CnoOcupacion,
            },
          };
        },
        motivoDuplicado: 'La relacion ocupacion-conocimiento ya existia, no se duplico.',
      });
    });
  }

  // ============================================================
  // 12. Verificaciones (no escriben nada)
  // ============================================================

  /**
   * Contrasta la copia denormalizada del nombre que guardan las tablas puente contra
   * el nombre real del catalogo. Cero divergencias es lo esperado; cualquier otra cosa
   * significa o que el catalogo se edito por fuera del cargue, o que la plantilla se
   * contradice entre dos hojas. Solo reporta: no reescribe filas que este cargue no creo.
   */
  private async verificarCatalogosContraRelaciones(): Promise<SheetResult> {
    const result = newSheetResult('Verificacion post-carga', 'catalogo <-> relacion');
    const consultas: Array<[string, string]> = [
      ['habilidad', `SELECT r.codigo_habilidad AS cod, h.nomb_hab_dest AS catalogo, r.nomb_hab_dest AS relacion, count(*)::int AS veces
        FROM clasificacion.cno_reg_habilidad r
        JOIN clasificacion.habilidad_destreza h ON h.cod_hab_dest = r.codigo_habilidad
        WHERE r.nomb_hab_dest IS DISTINCT FROM h.nomb_hab_dest
        GROUP BY 1, 2, 3 ORDER BY veces DESC`],
      ['conocimiento', `SELECT r.cod_conocimiento AS cod, c.nomb_conocimiento AS catalogo, r.nomb_conocimiento AS relacion, count(*)::int AS veces
        FROM clasificacion.cno_reg_conocimiento r
        JOIN clasificacion.cno_conocimiento c ON c.cod_conocimiento = r.cod_conocimiento
        WHERE r.nomb_conocimiento IS DISTINCT FROM c.nomb_conocimiento
        GROUP BY 1, 2, 3 ORDER BY veces DESC`],
    ];

    try {
      for (const [tipo, sql] of consultas) {
        const filas: any[] = await this.dataSource.query(sql);
        for (const f of filas) {
          result.warnings.push(
            `[${tipo} ${f.cod}] El catalogo dice "${f.catalogo}" pero ${f.veces} relacion(es) dicen "${f.relacion}". ` +
              'Revise si el catalogo se edito por fuera del cargue o si la plantilla escribe el nombre distinto en cada hoja.',
          );
        }
      }
      result.message =
        result.warnings.length === 0
          ? 'Verificacion post-carga: catalogos y relaciones coinciden.'
          : `Verificacion post-carga: ${result.warnings.length} divergencia(s) entre catalogo y relaciones.`;
    } catch (err: any) {
      result.errors.push(`No se pudo ejecutar la verificacion post-carga: ${describeDbError(err)}`);
      result.message = 'Verificacion post-carga no ejecutada.';
    }
    this.logger.log(result.message);
    return result;
  }

  /**
   * Avisa de las hojas del archivo que ningun procesador reclamo. Una hoja que nadie
   * mira se ignoraba en silencio: asi fue como "Nivel de conocimiento" estuvo sin
   * cargarse sin que nadie lo notara.
   */
  private reportarHojasNoReconocidas(
    workbook: XLSX.WorkBook,
    nombreHoja: Record<keyof typeof ALIAS_HOJA, string | undefined>,
  ): SheetResult {
    const result = newSheetResult('Hojas del archivo', '(ninguna)');
    const reconocidas = new Set(Object.values(nombreHoja).filter((n): n is string => !!n));
    const noReconocidas = workbook.SheetNames.filter((n) => !reconocidas.has(n));

    for (const nombre of noReconocidas) {
      result.warnings.push(`La hoja "${nombre}" no corresponde a ninguna tabla conocida y no se proceso.`);
    }
    result.message =
      noReconocidas.length === 0
        ? `Las ${reconocidas.size} hojas del archivo fueron procesadas.`
        : `${noReconocidas.length} hoja(s) del archivo no se procesaron: ${noReconocidas.join(', ')}.`;
    this.logger.log(result.message);
    return result;
  }

  // ============================================================
  // Utilidades internas
  // ============================================================

  /**
   * Descripcion de catalogo: si la plantilla no la trae, se guarda NULL y se avisa.
   * Antes se copiaba el nombre para no dejar la columna vacia, pero eso fabrica un
   * dato que nadie escribio y una descripcion identica al nombre es indistinguible
   * de una legitimamente corta. Un NULL dice la verdad y se puede consultar.
   */
  private descripcionOpcional(
    result: SheetResult,
    sheet: string,
    excelRow: number,
    codigo: string,
    valor: string,
  ): string | null {
    const limpio = valor.trim();
    if (limpio) return limpio;
    result.warnings.push(
      `[${sheet} - fila ${excelRow}] El codigo '${codigo}' no trae descripcion en la plantilla; se guardo vacia.`,
    );
    return null;
  }

  private avisarNombreDivergente(
    result: SheetResult,
    sheet: string,
    excelRow: number,
    codigo: string,
    nombreEnHoja: string,
    nombreEnCatalogo: string,
  ): void {
    if (!nombreEnHoja || nombreEnHoja === nombreEnCatalogo) return;
    result.warnings.push(
      `[${sheet} - fila ${excelRow}] El codigo '${codigo}' se llama "${nombreEnHoja}" en esta hoja pero ` +
        `"${nombreEnCatalogo}" en el catalogo; se guardo el del catalogo.`,
    );
  }

  private msg(r: SheetResult): string {
    const avisos = r.warnings.length > 0 ? `, ${r.warnings.length} avisos` : '';
    const ilegibles = r.unreadable > 0 ? `, ${r.unreadable} FILAS SIN CARGAR (ilegibles)` : '';
    if (r.errors.length > 0) {
      return `Error parcial en '${r.sheet}' (${r.tableName}): ${r.inserted} creados, ${r.updated} actualizados, ${r.errors.length} errores${ilegibles}${avisos}.`;
    }
    return `'${r.sheet}' (${r.tableName}) sincronizada: ${r.inserted} creados, ${r.updated} actualizados, ${r.skipped} sin cambios${ilegibles}${avisos}.`;
  }

  private formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
  }
}
