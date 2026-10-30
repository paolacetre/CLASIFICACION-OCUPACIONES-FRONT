import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { resincronizarSecuencia } from '../../cno/utils/cno-secuencia.util';
import * as XLSX from 'xlsx';

import { DEFINICIONES_CUOC, TipoCargaCuoc, normalizarEncabezado } from '../config/cuoc-carga.config';

export interface SheetResult {
  sheet: string;
  tableName: string;
  message: string;
  inserted: number;
  /** Filas existentes que el cargue modificó (texto, código, estado) para igualarlas al Excel. */
  updated?: number;
  skipped: number;
  errors: string[];
  /** Algo que no se perdió pero quedó pendiente (el frontend lo muestra como aviso, no como error). */
  warnings?: string[];
  /**
   * Lo que el cargue cambió para dejar la base igual al Excel (actualizó,
   * desactivó, quitó). Informativo: no hay nada que corregir, por eso no va en
   * `warnings`, que el frontend presenta como «algo por corregir».
   */
  changes?: string[];
}

export interface BulkUploadResult {
  message: string;
  totalInserted: number;
  totalUpdated: number;
  totalSkipped: number;
  totalErrors: number;
  sheets: SheetResult[];
}

const BATCH_SIZE = 200;

const HOJAS_AREA_COMPLEMENTARIA = ['Área Cual. Complementaria', 'Area Cual. Complementaria'];

/**
 * El export por tablas trae la jerarquía en cuatro hojas, una por nivel, en
 * vez de en columnas de la hoja Ocupación. Cada nivel apunta a su padre.
 */
const HOJAS_JERARQUIA_POR_TABLA = {
  granGrupo: ['cuoc_gran_grupo'],
  subgrupoPrincipal: ['cuoc_subgrupo_principal'],
  subgrupo: ['cuoc_subgrupo'],
  grupoPrimario: ['cuoc_grupo_primario'],
};

@Injectable()
export class CuocBulkUploadService {
  private readonly logger = new Logger(CuocBulkUploadService.name);
  constructor(private readonly dataSource: DataSource) {}

  async processExcel(buffer: Buffer): Promise<BulkUploadResult> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    this.logger.log(`[CUOC-Bulk] Pestañas encontradas: ${sheetNames.join(', ')}`);

    const results: SheetResult[] = [];

    results.push(await this.processAreaCualificacion(workbook));
    results.push(await this.processNivelesCompetencia(workbook));
    results.push(await this.processConocimientos(workbook));
    results.push(await this.processJerarquia(workbook));
    results.push(await this.processOcupaciones(workbook));
    // Después de las ocupaciones: la hoja de destrezas también trae la relación
    // ocupación–destreza, y esas filas se descartan si la ocupación todavía no
    // existe. Procesada antes, una carga sobre la BD vacía las perdía todas.
    results.push(await this.processDestrezas(workbook));
    results.push(await this.processFunciones(workbook));
    results.push(await this.processDenominaciones(workbook));
    results.push(await this.processRegConocimientos(workbook));
    results.push(await this.processOcupacionesAfines(workbook));

    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalUpdated = results.reduce((s, r) => s + (r.updated ?? 0), 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    try {
      const totalBD = await this.dataSource.query('SELECT COUNT(*) as cnt FROM cuoc_ocupacion');
      this.logger.log(`[CUOC-Bulk] Total registros en BD después de importar: ${totalBD[0]?.cnt ?? '?'}`);
    } catch { /* ignore */ }

    const globalMessage =
      totalErrors === 0
        ? `Carga masiva CUOC completada con éxito. Nuevos: ${totalInserted}, actualizados: ${totalUpdated}, sin cambios: ${totalSkipped}.`
        : `Carga CUOC finalizada con ${totalErrors} errores. Nuevos: ${totalInserted}, actualizados: ${totalUpdated}, sin cambios: ${totalSkipped}.`;

    this.logger.log(`[CUOC-Bulk] ${globalMessage}`);
    return { message: globalMessage, totalInserted, totalUpdated, totalSkipped, totalErrors, sheets: results };
  }

  /**
   * Carga SOLO el tipo que eligió el usuario en el modal, en vez de las 10
   * hojas de una vez como hace `processExcel`. Despacha a los mismos
   * procesadores ya probados; no duplica su lógica.
   *
   * «ocupacion» arrastra sus hojas dependientes (jerarquía, funciones,
   * denominaciones, conocimientos por ocupación y afines) porque una ocupación
   * sin ellas queda a medias: son parte del mismo registro, no tipos aparte.
   */
  /**
   * @param mapeoManual Correcciones explícitas del usuario desde «Configurar»
   *   en el modal (mismo formato que valida `CuocCargaValidacionService`):
   *   encabezado del archivo → clave del campo del sistema. Se aplica ANTES
   *   de despachar a los `processX`, para que lean la columna correcta sin
   *   tocar esa lógica ya probada.
   */
  async procesarTipo(
    buffer: Buffer,
    tipo: TipoCargaCuoc,
    mapeoManual?: Record<string, string>,
  ): Promise<BulkUploadResult> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    this.exigirHojaDelTipo(workbook, tipo);
    this.aplicarMapeoManual(workbook, tipo, mapeoManual);
    const results: SheetResult[] = [];

    switch (tipo) {
      case 'nivel':
        results.push(await this.processNivelesCompetencia(workbook));
        break;
      case 'area':
        results.push(await this.processAreaCualificacion(workbook));
        break;
      case 'habilidades':
        results.push(await this.processDestrezas(workbook));
        break;
      case 'conocimientos':
        results.push(await this.processConocimientos(workbook));
        break;
      case 'ocupacion':
        results.push(await this.processJerarquia(workbook));
        results.push(await this.processOcupaciones(workbook));
        results.push(await this.processFunciones(workbook));
        results.push(await this.processDenominaciones(workbook));
        results.push(await this.processRegConocimientos(workbook));
        results.push(await this.processOcupacionesAfines(workbook));
        // Las destrezas de cada ocupación son parte de ella, como sus
        // conocimientos. Si el catálogo de destrezas se cargó antes que las
        // ocupaciones, sus relaciones se omitieron y se recuperan aquí.
        results.push(await this.processDestrezas(workbook, { soloRelaciones: true }));
        break;
    }

    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalUpdated = results.reduce((s, r) => s + (r.updated ?? 0), 0);
    const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    const etiqueta = DEFINICIONES_CUOC[tipo].etiqueta;
    const message =
      totalErrors === 0
        ? `Carga de «${etiqueta}» completada. Nuevos: ${totalInserted}, actualizados: ${totalUpdated}, sin cambios: ${totalSkipped}.`
        : `Carga de «${etiqueta}» finalizada con ${totalErrors} error(es). Nuevos: ${totalInserted}, actualizados: ${totalUpdated}, sin cambios: ${totalSkipped}.`;

    this.logger.log(`[CUOC-Bulk] ${message}`);
    return { message, totalInserted, totalUpdated, totalSkipped, totalErrors, sheets: results };
  }

  /**
   * Sin la hoja del tipo, cada `processX` devolvía «se omite» con 0 errores, y
   * «Cargar todo» marcaba el tipo como correcto sin haber leído una sola fila.
   * Se rechaza con los nombres aceptados y los que trae el archivo, para que
   * se vea de inmediato qué hoja hay que renombrar.
   */
  private exigirHojaDelTipo(workbook: XLSX.WorkBook, tipo: TipoCargaCuoc): void {
    const definicion = DEFINICIONES_CUOC[tipo];
    const candidatas = tipo === 'area' ? [...definicion.hojas, ...HOJAS_AREA_COMPLEMENTARIA] : definicion.hojas;
    if (this.findSheet(workbook, candidatas)) return;

    const lista = (nombres: string[]) => nombres.map((n) => `«${n}»`).join(', ');
    throw new BadRequestException(
      `El archivo no tiene la hoja de «${definicion.etiqueta}». Hojas aceptadas: ${lista(definicion.hojas)}. ` +
        `Hojas del archivo: ${lista(workbook.SheetNames)}.`,
    );
  }

  /**
   * Renombra, en la hoja del tipo elegido, el encabezado de cada columna que
   * el usuario corrigió a mano en «Configurar» por el alias oficial del campo
   * al que la asignó. Así, cuando el `processX` de siempre vuelva a leer la
   * hoja con `sheetToRows`/`pick`, encuentra esa columna como si el archivo
   * hubiera traído el encabezado esperado — sin tocar esos métodos, que ya
   * están probados y sirven a los otros nueve tipos de hoja del importador
   * clásico (`processExcel`).
   *
   * Solo actúa sobre la hoja de `DEFINICIONES_CUOC[tipo]`: es la única hoja
   * cuyas columnas se muestran y se corrigen en el modal de carga.
   */
  private aplicarMapeoManual(
    workbook: XLSX.WorkBook,
    tipo: TipoCargaCuoc,
    mapeoManual?: Record<string, string>,
  ): void {
    if (!mapeoManual || Object.keys(mapeoManual).length === 0) return;

    const definicion = DEFINICIONES_CUOC[tipo];
    const ws = this.findSheet(workbook, definicion.hojas);
    if (!ws || !ws['!ref']) return;

    const headerRow = this.findHeaderRow(ws);
    const range = XLSX.utils.decode_range(ws['!ref']);

    for (const [encabezadoCrudo, clave] of Object.entries(mapeoManual)) {
      const columna = definicion.columnas.find((c) => c.clave === clave);
      if (!columna) continue; // clave ajena a este tipo

      const objetivo = normalizarEncabezado(encabezadoCrudo);
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: headerRow, c });
        const cell = ws[addr];
        if (cell?.v == null || normalizarEncabezado(cell.v) !== objetivo) continue;

        // El alias ya viene normalizado (minúsculas, sin tildes); `pick()`
        // normaliza igual al comparar, así que sirve como encabezado "oficial".
        cell.v = columna.alias[0];
        cell.t = 's';
        if ('w' in cell) delete cell.w; // el texto formateado quedaría desactualizado
        break;
      }
    }
  }

  // ── Sheet lookup ──
  private findSheet(workbook: XLSX.WorkBook, candidates: string[]): XLSX.WorkSheet | undefined {
    for (const name of candidates) {
      if (workbook.Sheets[name]) return workbook.Sheets[name];
    }
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    for (const sheetName of workbook.SheetNames) {
      const sn = norm(sheetName);
      for (const c of candidates) {
        if (sn === norm(c)) return workbook.Sheets[sheetName];
      }
    }
    return undefined;
  }

  /**
   * Fila donde empiezan los encabezados. Las plantillas oficiales traen título
   * y notas encima de la tabla, así que no se puede asumir la primera fila.
   *
   * Primero se busca la fila que más encabezados conocidos contenga (los
   * mismos alias que usa la validación). Si ninguna coincide —hojas como
   * funciones o denominaciones, cuyas columnas no están en las definiciones—
   * se cae a la búsqueda por palabra clave de siempre.
   */
  private findHeaderRow(ws: XLSX.WorkSheet): number {
    const ref = ws['!ref'];
    if (!ref) return 0;
    const range = XLSX.utils.decode_range(ref);
    const ultima = Math.min(range.e.r, range.s.r + 25);

    const aliasConocidos = new Set(
      Object.values(DEFINICIONES_CUOC).flatMap((d) => d.columnas.flatMap((c) => c.alias)),
    );

    let mejorFila = -1;
    let mejorPuntaje = 0;
    for (let r = range.s.r; r <= ultima; r++) {
      let puntaje = 0;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell?.v != null && aliasConocidos.has(normalizarEncabezado(cell.v))) puntaje++;
      }
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejorFila = r;
      }
    }
    if (mejorFila >= 0) return mejorFila;

    const keywords = ['codigo', 'código', 'cod_ocupacion', 'nom_ocupacion', 'nombre_ocupacion'];
    for (let r = range.s.r; r <= ultima; r++) {
      let rowText = '';
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell?.v) rowText += String(cell.v).toLowerCase() + ' ';
      }
      if (keywords.some((k) => rowText.includes(k))) return r;
    }

    // Último recurso: encabezados hechos a medida, sin ningún alias ni
    // palabra clave reconocible (solo llega aquí con un `mapeoManual` desde
    // el modal). La primera fila que llena tantas celdas como la que más
    // suele ser la de encabezados: un título suelto en una sola celda queda
    // detrás. Debe coincidir con `mejorFilaGenerica` de la validación, o el
    // mapeo manual apuntaría a una fila distinta de la que el usuario vio.
    let mejorFilaPorRelleno = range.s.r;
    let mejorPuntajeRelleno = -1;
    for (let r = range.s.r; r <= ultima; r++) {
      let noVacias = 0;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell?.v != null && String(cell.v).trim() !== '') noVacias++;
      }
      if (noVacias > mejorPuntajeRelleno) {
        mejorPuntajeRelleno = noVacias;
        mejorFilaPorRelleno = r;
      }
    }
    return mejorFilaPorRelleno;
  }

  private sheetToRows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
    if (!ws || !ws['!ref']) return [];
    const headerRow = this.findHeaderRow(ws);
    const range = XLSX.utils.decode_range(ws['!ref']);
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: headerRow, c })];
      headers.push(cell?.v != null ? String(cell.v).trim() : '');
    }
    const nonEmptyCols = headers.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
    const rows: Record<string, unknown>[] = [];
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const row: Record<string, unknown> = {};
      let hasData = false;
      for (const ci of nonEmptyCols) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
        const val = cell?.v;
        if (val != null && val !== '') {
          row[headers[ci]] = val;
          hasData = true;
        }
      }
      if (hasData) rows.push(row);
    }
    return rows;
  }

  private pick(row: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    const normKeys = keys.map(norm);
    for (const [k, v] of Object.entries(row)) {
      if (normKeys.includes(norm(k))) return v;
    }
    return undefined;
  }

  private toInt(v: unknown): number | null {
    if (v === undefined || v === null || v === '') return null;
    const n = parseInt(String(v).trim(), 10);
    return isNaN(n) ? null : n;
  }

  private toStr(v: unknown): string {
    if (v === undefined || v === null) return '';
    return String(v).trim();
  }

  /**
   * Fecha de una celda como YYYY-MM-DD: número de serie de Excel, texto ISO o
   * dd/mm/aaaa. null si viene vacía o no se reconoce.
   */
  private toFecha(v: unknown): string | null {
    if (v === undefined || v === null || v === '') return null;
    const dosDigitos = (n: number) => String(n).padStart(2, '0');
    if (v instanceof Date) {
      return isNaN(v.getTime()) ? null : `${v.getFullYear()}-${dosDigitos(v.getMonth() + 1)}-${dosDigitos(v.getDate())}`;
    }
    if (typeof v === 'number') {
      const d = XLSX.SSF.parse_date_code(v);
      return d ? `${d.y}-${dosDigitos(d.m)}-${dosDigitos(d.d)}` : null;
    }
    const texto = String(v).trim();
    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dma = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return dma ? `${dma[3]}-${dosDigitos(+dma[2])}-${dosDigitos(+dma[1])}` : null;
  }

  /** 1/0 a partir de la celda de estado; null si viene vacía o no se reconoce. */
  private toEstado(v: unknown): number | null {
    const s = this.toStr(v)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    if (['1', 'true', 'si', 'activo', 'activa'].includes(s)) return 1;
    if (['0', 'false', 'no', 'inactivo', 'inactiva'].includes(s)) return 0;
    return null;
  }

  /** `query` de un UPDATE/DELETE ... RETURNING en pg devuelve [filas, conteo]. */
  private filasDevueltas<T>(resultado: unknown): T[] {
    const r = resultado as unknown[];
    return (Array.isArray(r[0]) ? r[0] : r) as T[];
  }

  /**
   * Borra, de las ocupaciones que trae la hoja, las relaciones (destrezas,
   * conocimientos, afines) que ya no vienen en el Excel. El cargue solo
   * agregaba pares, así que una relación retirada del Excel seguía apareciendo
   * en la ocupación. Son tablas puente sin estado ni referencias entrantes, y
   * la edición manual de la ocupación ya las reemplaza borrando.
   *
   * Mismos resguardos que `inactivarAusentes` de CNO: solo ocupaciones de la
   * hoja (las copias de Análisis no vienen y no se tocan), y nada si la hoja
   * tuvo errores, porque una fila que falló parecería retirada.
   *
   * @param pares `${ocupación}|${código relacionado}` de cada fila del Excel.
   */
  private async quitarRelacionesAusentes(
    result: SheetResult,
    tabla: 'cuoc_destreza' | 'cuoc_reg_conocimientos' | 'cuoc_ocupacion_afin',
    columnaRelacionada: 'codigo_destreza' | 'cod_conocimiento' | 'codigo_ocupacion',
    pares: Set<string>,
    descripcion: string,
  ): Promise<void> {
    const ocupaciones = [...new Set([...pares].map((p) => p.split('|')[0]))];
    if (ocupaciones.length === 0) return;
    if (result.errors.length > 0) {
      (result.warnings ??= []).push(
        `No se quitaron ${descripcion} ausentes del Excel porque la hoja tuvo errores; corrija el archivo y vuelva a cargarlo.`,
      );
      return;
    }
    const borradas = this.filasDevueltas<unknown>(
      await this.dataSource.query(
        `DELETE FROM ${tabla}
          WHERE cod_ocupacion_cuoc = ANY($1::text[])
            AND NOT ((cod_ocupacion_cuoc || '|' || ${columnaRelacionada}::text) = ANY($2::text[]))
        RETURNING 1`,
        [ocupaciones, [...pares]],
      ),
    );
    if (borradas.length > 0) {
      (result.changes ??= []).push(`Se quitaron ${borradas.length} ${descripcion} que ya no vienen en el Excel.`);
    }
  }

  /**
   * Reparte el resultado de un upsert con `WHERE ... IS DISTINCT FROM` y
   * `RETURNING (xmax = 0) AS insertada`: lo devuelto se insertó (`xmax = 0`) o
   * se modificó; lo que no vuelve ya estaba idéntico y no se reescribió. Antes
   * cada fila contaba como «insertada», así que recargar el mismo archivo
   * parecía volver a cargarlo todo.
   */
  private contarUpsert(result: SheetResult, filas: { insertada: boolean }[], enviadas: number): void {
    const insertadas = filas.filter((f) => f.insertada).length;
    result.inserted += insertadas;
    result.updated = (result.updated ?? 0) + filas.length - insertadas;
    result.skipped += enviadas - filas.length;
  }

  private msg(r: SheetResult): string {
    const cifras = `${r.inserted} nuevos, ${r.updated ?? 0} actualizados, ${r.skipped} sin cambios`;
    if (r.errors.length > 0) return `Error parcial en '${r.sheet}' (${r.tableName}): ${cifras}, ${r.errors.length} errores.`;
    return `'${r.sheet}' (${r.tableName}) procesada: ${cifras}.`;
  }

  // ── 1. ÁREA DE CUALIFICACIÓN ──
  private async processAreaCualificacion(workbook: XLSX.WorkBook): Promise<SheetResult> {
    const wsPrincipal = this.findSheet(workbook, DEFINICIONES_CUOC.area.hojas);
    const wsComplementaria = this.findSheet(workbook, HOJAS_AREA_COMPLEMENTARIA);

    const result: SheetResult = {
      sheet: 'Área de cualificación',
      tableName: 'cuoc_area_cualificacion',
      message: '',
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    if (!wsPrincipal && !wsComplementaria) {
      result.message = 'Pestañas de área de cualificación no encontradas, se omite.';
      return result;
    }

    const areas = new Map<string, string>();
    if (wsPrincipal) {
      const rows = this.sheetToRows(wsPrincipal);
      for (const row of rows) {
        // `cod_area_cualifi_cuoc` antes que `codigo`: en el export por tablas
        // `codigo` es el id de la fila; tomado como sigla, la purga de abajo
        // borraría todas las áreas reales.
        const sigla = this.toStr(this.pick(row, ['SIGLA', 'sigla', 'cod_area_cualifi_cuoc', 'codigo', 'Código']));
        const nombre = this.toStr(
          this.pick(row, [
            'Área de Cualificación Principal',
            'Area de Cualificacion Principal',
            'nombre',
            'Nombre',
            'nom_area',
            'nom_cualificacion',
            'desc_area_cualifi_cuoc',
          ]),
        );
        if (sigla && nombre) {
          areas.set(sigla, nombre);
        }
      }
    }
    if (wsComplementaria) {
      const rows = this.sheetToRows(wsComplementaria);
      for (const row of rows) {
        const sigla = this.toStr(this.pick(row, ['SIGLA', 'sigla', 'codigo', 'Código']));
        const nombre = this.toStr(
          this.pick(row, ['Área de Cualificación Complementaria', 'Area de Cualificacion Complementaria', 'nombre', 'Nombre']),
        );
        if (sigla && nombre && !areas.has(sigla)) {
          areas.set(sigla, nombre);
        }
      }
    }

    // Reasignar ocupaciones comparativas que tengan códigos de área espurios terminados en '-AC' a su área real
    try {
      await this.dataSource.query(`
        UPDATE clasificacion.cuoc_ocupacion o
        SET codigo_area_cuoc = orig.codigo_area_cuoc
        FROM clasificacion.cuoc_ocupacion orig
        WHERE o.codigo_area_cuoc LIKE '%-AC'
          AND orig.cod_ocupacion_cuoc = SPLIT_PART(o.cod_ocupacion_cuoc, '-', 1)
      `);
    } catch (err) {
      this.logger.warn(`No se pudieron reasignar áreas -AC: ${err.message}`);
    }

    const codigosExcel = Array.from(areas.keys());
    for (const [codigo, nombre] of areas) {
      try {
        const filas = await this.dataSource.query(
          `INSERT INTO cuoc_area_cualificacion AS a (codigo, descripcion) VALUES ($1, $2)
           ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion
           WHERE a.descripcion IS DISTINCT FROM EXCLUDED.descripcion
           RETURNING (xmax = 0) AS insertada`,
          [codigo, nombre],
        );
        this.contarUpsert(result, filas, 1);
      } catch (err) {
        result.errors.push(`Área ${codigo}: ${err.message}`);
      }
    }

    // Purgar áreas que no pertenezcan al Excel oficial
    if (codigosExcel.length > 0) {
      try {
        await this.dataSource.query(
          `DELETE FROM clasificacion.cuoc_area_cualificacion WHERE codigo NOT IN (${codigosExcel.map((_, i) => `$${i + 1}`).join(', ')})`,
          codigosExcel,
        );
      } catch (err) {
        this.logger.warn(`No se pudieron purgar áreas obsoletas: ${err.message}`);
      }
    }

    result.message = this.msg(result);
    this.logger.log(`[CUOC-Bulk] Áreas de cualificación: ${this.msg(result)}`);
    return result;
  }

  // ── 2. NIVELES DE COMPETENCIA ──
  private async processNivelesCompetencia(workbook: XLSX.WorkBook): Promise<SheetResult> {
    const ws = this.findSheet(workbook, DEFINICIONES_CUOC.nivel.hojas);
    const result: SheetResult = {
      sheet: 'Niveles de competencia',
      tableName: 'cuoc_nivel_competencia',
      message: '',
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    if (!ws) {
      result.message = 'Pestaña de niveles de competencia no encontrada, se omite.';
      return result;
    }
    const rows = this.sheetToRows(ws);
    // Nivel → descripción. La hoja oficial trae una fila por ocupación y sin
    // descripción (null); el export por tablas, una por nivel con su texto.
    const levels = new Map<number, string | null>();
    for (const row of rows) {
      const lvl = this.toInt(
        this.pick(row, ['Nivel de Competencia', 'nivel_competencia', 'nivel', 'cod_nivel', 'cod_niveles_competencia_cuoc']),
      );
      if (lvl === null) continue;
      // El texto viene como «Nivel 1:   Las ocupaciones…»: el nombre ya es
      // «Nivel 1», así que a la descripción solo va lo que sigue.
      const descripcion = this.toStr(
        this.pick(row, ['nom_niveles_competencia_cuoc', 'Descripción del nivel', 'descripcion_nivel']),
      ).replace(/^nivel\s*\d+\s*:\s*/i, '');
      if (!levels.has(lvl) || descripcion) levels.set(lvl, descripcion || null);
    }
    for (const [lvl, descripcion] of levels) {
      try {
        // COALESCE: un archivo sin descripción no borra la que ya tenga el nivel.
        const filas = await this.dataSource.query(
          `INSERT INTO cuoc_nivel_competencia AS n (cod_nivel, nombre_nivel, descripcion) VALUES ($1, $2, $3)
           ON CONFLICT (cod_nivel) DO UPDATE SET
             nombre_nivel = EXCLUDED.nombre_nivel,
             descripcion = COALESCE(EXCLUDED.descripcion, n.descripcion)
           WHERE (n.nombre_nivel, n.descripcion)
             IS DISTINCT FROM (EXCLUDED.nombre_nivel, COALESCE(EXCLUDED.descripcion, n.descripcion))
           RETURNING (xmax = 0) AS insertada`,
          [lvl, `Nivel ${lvl}`, descripcion],
        );
        this.contarUpsert(result, filas, 1);
      } catch (err) {
        result.errors.push(`Nivel ${lvl}: ${err.message}`);
      }
    }

    if (levels.size > 0) {
      try {
        const validLvls = Array.from(levels.keys());
        await this.dataSource.query(
          // NOT es_copia: las copias de Análisis no vienen en el Excel oficial y no deben purgarse.
          `DELETE FROM cuoc_nivel_competencia WHERE NOT es_copia AND cod_nivel NOT IN (${validLvls.map((_, i) => `$${i + 1}`).join(', ')})`,
          validLvls,
        );
      } catch (err) {
        this.logger.warn(`No se pudieron purgar niveles obsoletos: ${err.message}`);
      }
    }

    result.message = this.msg(result);
    this.logger.log(`[CUOC-Bulk] Niveles de competencia: ${this.msg(result)}`);
    return result;
  }

  // ── 3. CONOCIMIENTOS ──
  private async processConocimientos(workbook: XLSX.WorkBook): Promise<SheetResult> {
    const ws = this.findSheet(workbook, DEFINICIONES_CUOC.conocimientos.hojas);
    const result: SheetResult = {
      sheet: 'Conocimientos',
      tableName: 'cuoc_conocimiento',
      message: '',
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    if (!ws) {
      result.message = 'Pestaña de conocimientos no encontrada, se omite.';
      return result;
    }
    const rows = this.sheetToRows(ws);
    const seen = new Map<number, { cod: number; nombre: string; desc: string }>();
    for (const row of rows) {
      const cod = this.toInt(
        this.pick(row, [
          'ID',
          'id',
          'cod_conocimiento',
          'Código del conocimiento',
          'codigo_conocimiento',
          'cod_conocimiento_cuoc',
        ]),
      );
      if (cod === null) continue;
      if (!seen.has(cod)) {
        seen.set(cod, {
          cod,
          nombre: this.toStr(
            this.pick(row, [
              'Nombre del Conocimiento',
              'Nombre del conocimiento',
              'nomb_conocimiento',
              'nombre_conocimiento',
              'nomb_conocimiento_cuoc',
            ]),
          ),
          desc: this.toStr(
            this.pick(row, [
              'desc_conocimiento',
              'descripcion_conocimiento',
              'Descripción del conocimiento',
              'desc_conocimiento_cuoc',
            ]),
          ),
        });
      }
    }
    const items = Array.from(seen.values());
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      try {
        const values = batch
          .map((_, idx) => {
            const b = idx * 3;
            return `($${b + 1}, $${b + 2}, $${b + 3})`;
          })
          .join(', ');
        const params = batch.flatMap((k) => [k.cod, k.nombre, k.desc]);
        const filas = await this.dataSource.query(
          // Descripción vacía en el archivo = no la trae; no se borra la que haya.
          `INSERT INTO cuoc_conocimiento AS c (cod_conocimiento, nomb_conocimiento, desc_conocimiento) VALUES ${values}
           ON CONFLICT (cod_conocimiento) DO UPDATE SET
             nomb_conocimiento = EXCLUDED.nomb_conocimiento,
             desc_conocimiento = COALESCE(NULLIF(EXCLUDED.desc_conocimiento, ''), c.desc_conocimiento)
           WHERE (c.nomb_conocimiento, c.desc_conocimiento)
             IS DISTINCT FROM (EXCLUDED.nomb_conocimiento, COALESCE(NULLIF(EXCLUDED.desc_conocimiento, ''), c.desc_conocimiento))
           RETURNING (xmax = 0) AS insertada`,
          params,
        );
        this.contarUpsert(result, filas, batch.length);
      } catch (err) {
        result.errors.push(`Lote conocimientos ${i}: ${err.message}`);
      }
    }

    if (items.length > 0) {
      const validCods = items.map((k) => k.cod);
      try {
        await this.dataSource.query(
          `DELETE FROM cuoc_conocimiento WHERE cod_conocimiento NOT IN (${validCods.map((_, i) => `$${i + 1}`).join(', ')})`,
          validCods,
        );
      } catch (err) {
        this.logger.warn(`No se pudieron purgar conocimientos obsoletos: ${err.message}`);
      }
    }

    result.message = this.msg(result);
    this.logger.log(`[CUOC-Bulk] Conocimientos: ${this.msg(result)}`);
    return result;
  }

  // ── 4. DESTREZAS ──
  /**
   * @param opciones.soloRelaciones Solo inserta ocupación–destreza (sin tocar el
   *   catálogo `habilidad_destreza`); lo usa la carga de «ocupacion».
   */
  private async processDestrezas(
    workbook: XLSX.WorkBook,
    opciones: { soloRelaciones?: boolean } = {},
  ): Promise<SheetResult> {
    const ws = this.findSheet(workbook, DEFINICIONES_CUOC.habilidades.hojas);
    const result: SheetResult = {
      sheet: 'Destrezas',
      tableName: 'habilidad_destreza',
      message: '',
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    if (!ws) {
      result.message = 'Pestaña de destrezas no encontrada, se omite.';
      return result;
    }
    if (opciones.soloRelaciones) {
      result.sheet = 'Destrezas por ocupación';
      result.tableName = 'cuoc_destreza';
    }
    const rows = this.sheetToRows(ws);
    const seen = new Map<number, { cod: number; nombre: string; desc: string }>();
    const relations = new Set<string>();
    for (const row of rows) {
      const cod = this.toInt(
        this.pick(row, ['ID', 'id', 'cod_hab_dest', 'codigo_destreza', 'Código de la destreza', 'codigo']),
      );
      if (cod === null) continue;
      if (!seen.has(cod)) {
        seen.set(cod, {
          cod,
          nombre: this.toStr(
            this.pick(row, ['Nombre de la Destreza', 'Nombre de la destreza', 'nomb_hab_dest', 'nombre_destreza', 'nombre']),
          ),
          desc: this.toStr(
            this.pick(row, [
              'desc_hab_dest',
              'descripcion_destreza',
              'Descripción de la destreza',
              'descripcion',
            ]),
          ),
        });
      }

      const codOcup = this.toStr(
        this.pick(row, [
          'Código de la Ocupación',
          'codigodelaocupacion',
          'cod_ocupacion_cuoc',
          'codigo_ocupacion',
          'Código ocupación',
          'cod_ocupacion',
        ]),
      );
      if (codOcup) {
        relations.add(`${codOcup}|${cod}`);
      }
    }
    const items = opciones.soloRelaciones ? [] : Array.from(seen.values());
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      try {
        const values = batch
          .map((_, idx) => {
            const b = idx * 3;
            return `($${b + 1}, $${b + 2}, $${b + 3})`;
          })
          .join(', ');
        const params = batch.flatMap((h) => [h.cod, h.nombre, h.desc]);
        const filas = await this.dataSource.query(
          // El export por tablas no trae descripción: no se borra la que haya.
          `INSERT INTO habilidad_destreza AS h (cod_hab_dest, nomb_hab_dest, desc_hab_dest) VALUES ${values}
           ON CONFLICT (cod_hab_dest) DO UPDATE SET
             nomb_hab_dest = EXCLUDED.nomb_hab_dest,
             desc_hab_dest = COALESCE(NULLIF(EXCLUDED.desc_hab_dest, ''), h.desc_hab_dest)
           WHERE (h.nomb_hab_dest, h.desc_hab_dest)
             IS DISTINCT FROM (EXCLUDED.nomb_hab_dest, COALESCE(NULLIF(EXCLUDED.desc_hab_dest, ''), h.desc_hab_dest))
           RETURNING (xmax = 0) AS insertada`,
          params,
        );
        this.contarUpsert(result, filas, batch.length);
      } catch (err) {
        result.errors.push(`Lote destrezas ${i}: ${err.message}`);
      }
    }
    await resincronizarSecuencia(this.dataSource.manager, 'habilidad_destreza', 'cod_hab_dest');

    const ocupRows = await this.dataSource.query('SELECT cod_ocupacion_cuoc FROM cuoc_ocupacion');
    const ocupExists = new Set(ocupRows.map((r: any) => r.cod_ocupacion_cuoc));

    const existingRelRows = await this.dataSource.query(
      'SELECT cod_ocupacion_cuoc, codigo_destreza FROM cuoc_destreza',
    );
    const existingRel = new Set(existingRelRows.map((r: any) => `${r.cod_ocupacion_cuoc}|${r.codigo_destreza}`));

    const destRows = await this.dataSource.query('SELECT cod_hab_dest FROM habilidad_destreza');
    const destExists = new Set(destRows.map((r: any) => Number(r.cod_hab_dest)));

    const candidatas = Array.from(relations).map((k) => {
      const [codOcup, codDest] = k.split('|');
      return { codOcup, codDest: Number(codDest) };
    });
    // Antes se descartaban en silencio; ahora cuentan como omitidas para que
    // una carga en el orden equivocado no parezca exitosa.
    const sinOcupacion = candidatas.filter((r) => !ocupExists.has(r.codOcup)).length;
    const sinDestreza = candidatas.filter((r) => ocupExists.has(r.codOcup) && !destExists.has(r.codDest)).length;
    result.skipped += sinOcupacion + sinDestreza;
    if (sinOcupacion > 0) {
      result.errors.push(
        `${sinOcupacion} relación(es) ocupación–destreza omitidas porque la ocupación no existe; ` +
          'cargue las ocupaciones y vuelva a cargar este archivo.',
      );
    }
    if (sinDestreza > 0 && opciones.soloRelaciones) {
      // Desde «ocupacion» solo se enlaza lo que ya existe: una destreza que aún no
      // está en el catálogo no es un dato perdido, se enlaza al cargar «habilidades».
      (result.warnings ??= []).push(
        `${sinDestreza} relación(es) ocupación–destreza quedan pendientes porque la destreza aún no está en el catálogo; ` +
          'se enlazarán al cargar «Habilidades».',
      );
    } else if (sinDestreza > 0) {
      result.errors.push(`${sinDestreza} relación(es) ocupación–destreza omitidas porque la destreza no existe en el catálogo.`);
    }

    const relItems = candidatas.filter(
      (r) =>
        ocupExists.has(r.codOcup) &&
        destExists.has(r.codDest) &&
        Number.isFinite(r.codDest) &&
        !existingRel.has(`${r.codOcup}|${r.codDest}`),
    );

    for (let i = 0; i < relItems.length; i += BATCH_SIZE) {
      const batch = relItems.slice(i, i + BATCH_SIZE);
      try {
        const values = batch
          .map((_, idx) => {
            const b = idx * 3;
            return `($${b + 1}, $${b + 2}, $${b + 3})`;
          })
          .join(', ');
        const params = batch.flatMap((r) => [
          r.codDest,
          r.codOcup,
          seen.get(r.codDest)?.nombre ?? null,
        ]);
        await this.dataSource.query(
          `INSERT INTO cuoc_destreza (codigo_destreza, cod_ocupacion_cuoc, nomb_hab_dest) VALUES ${values}`,
          params,
        );
        result.inserted += batch.length;
      } catch (err) {
        result.errors.push(`Lote rel_destrezas ${i}: ${err.message}`);
      }
    }
    await this.quitarRelacionesAusentes(result, 'cuoc_destreza', 'codigo_destreza', relations, 'destreza(s) de ocupación');

    result.message = this.msg(result);
    this.logger.log(`[CUOC-Bulk] Destrezas: ${this.msg(result)}`);
    return result;
  }

  // ── 5. JERARQUÍA ──
  private async processJerarquia(workbook: XLSX.WorkBook): Promise<SheetResult> {
    const ws = this.findSheet(workbook, [
      'Ocupación',
      'Ocupacion',
      'Ocupaciones',
      'Jerarquía CUOC',
      'Jerarquia CUOC',
      'jerarquia_cuoc',
    ]);
    const wsGranGrupo = this.findSheet(workbook, HOJAS_JERARQUIA_POR_TABLA.granGrupo);
    const wsSubgrupoPrincipal = this.findSheet(workbook, HOJAS_JERARQUIA_POR_TABLA.subgrupoPrincipal);
    const wsSubgrupo = this.findSheet(workbook, HOJAS_JERARQUIA_POR_TABLA.subgrupo);
    const wsGrupoPrimario = this.findSheet(workbook, HOJAS_JERARQUIA_POR_TABLA.grupoPrimario);
    const result: SheetResult = {
      sheet: 'Jerarquía',
      tableName: 'cuoc_gran_grupo,cuoc_subgrupo_principal,cuoc_subgrupo,cuoc_grupo_primario',
      message: '',
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    if (!ws && !wsGranGrupo && !wsSubgrupoPrincipal && !wsSubgrupo && !wsGrupoPrimario) {
      result.message = 'Pestaña de jerarquía no encontrada, se omite.';
      return result;
    }
    const rows = ws ? this.sheetToRows(ws) : [];
    const granGrupos = new Map<string, string>();
    const subPrincipales = new Map<string, { nom: string; codGg: string }>();
    const subgrupos = new Map<string, { nom: string; codSp: string }>();
    const gruposPrimarios = new Map<string, { nom: string; codSg: string }>();

    for (const row of rows) {
      const codGg = this.toStr(this.pick(row, ['Código del Gran Grupo', 'cod_gran_grupo', 'cod_gg', 'Gran grupo']));
      const nomGg = this.toStr(
        this.pick(row, ['Nombre del Gran Grupo', 'nom_gran_grupo', 'nombre_gg', 'Nombre gran grupo', 'Gran grupo nombre']),
      );
      if (codGg) granGrupos.set(codGg, nomGg);

      const codSp = this.toStr(
        this.pick(row, ['Código del Subgrupo Principal', 'cod_subgrupo_p', 'cod_sp', 'Subgrupo principal']),
      );
      const nomSp = this.toStr(
        this.pick(row, [
          'Nombre del Subgrupo Principal',
          'nom_subgrupo_p',
          'nombre_sp',
          'Nombre subgrupo principal',
          'Subgrupo principal nombre',
        ]),
      );
      const inferredGg = codSp ? codSp.charAt(0) : '';
      if (codSp)
        subPrincipales.set(codSp, {
          nom: nomSp,
          codGg: inferredGg || codGg,
        });

      const codSg = this.toStr(this.pick(row, ['Código del Subgrupo', 'cod_subgrupo_c', 'cod_sg', 'Subgrupo']));
      const nomSg = this.toStr(
        this.pick(row, ['Nombre del Subgrupo', 'nom_subgrupo_c', 'nombre_sg', 'Nombre subgrupo', 'Subgrupo nombre']),
      );
      if (codSg) subgrupos.set(codSg, { nom: nomSg, codSp: codSp || '' });

      const codGp = this.toStr(
        this.pick(row, ['Código del Grupo Primario', 'cod_grupo_prim', 'cod_gp', 'Grupo primario']),
      );
      const nomGp = this.toStr(
        this.pick(row, [
          'Nombre del Grupo Primario',
          'nom_grupo_prim',
          'nombre_gp',
          'Nombre grupo primario',
          'Grupo primario nombre',
        ]),
      );
      if (codGp) gruposPrimarios.set(codGp, { nom: nomGp, codSg: codSg || '' });
    }

    // Export por tablas: una hoja por nivel. `cod_sobgrupo_principal_cuoc` y
    // `*_couoc` son erratas que trae el archivo tal cual.
    for (const row of wsGranGrupo ? this.sheetToRows(wsGranGrupo) : []) {
      const cod = this.toStr(this.pick(row, ['cod_gran_grupo_cuoc']));
      if (cod) granGrupos.set(cod, this.toStr(this.pick(row, ['nom_gran_grupo_cuoc'])));
    }
    for (const row of wsSubgrupoPrincipal ? this.sheetToRows(wsSubgrupoPrincipal) : []) {
      const cod = this.toStr(this.pick(row, ['cod_subgrupo_principal_cuoc']));
      if (!cod) continue;
      subPrincipales.set(cod, {
        nom: this.toStr(this.pick(row, ['nom_subgrupo_principal_cuoc'])),
        codGg: this.toStr(this.pick(row, ['cod_gran_grupo_cuoc'])) || cod.charAt(0),
      });
    }
    for (const row of wsSubgrupo ? this.sheetToRows(wsSubgrupo) : []) {
      const cod = this.toStr(this.pick(row, ['cod_subgrupo_cuoc']));
      if (!cod) continue;
      subgrupos.set(cod, {
        nom: this.toStr(this.pick(row, ['nom_subgrupo_cuoc'])),
        codSp: this.toStr(this.pick(row, ['cod_sobgrupo_principal_cuoc', 'cod_subgrupo_principal_cuoc'])),
      });
    }
    for (const row of wsGrupoPrimario ? this.sheetToRows(wsGrupoPrimario) : []) {
      const cod = this.toStr(this.pick(row, ['cod_grupo_primario_couoc', 'cod_grupo_primario_cuoc']));
      if (!cod) continue;
      gruposPrimarios.set(cod, {
        nom: this.toStr(this.pick(row, ['nom_grupo_primario_couoc', 'nom_grupo_primario_cuoc'])),
        // En esta hoja `cod_subgrupo_cuoc` es el PADRE, no el código propio.
        codSg: this.toStr(this.pick(row, ['cod_subgrupo_cuoc'])),
      });
    }

    // Insert Gran Grupo
    for (const [cod, nom] of granGrupos) {
      try {
        const filas = await this.dataSource.query(
          `INSERT INTO cuoc_gran_grupo AS g (cod_gran_grupo, nom_gran_grupo) VALUES ($1, $2)
           ON CONFLICT (cod_gran_grupo) DO UPDATE SET nom_gran_grupo = EXCLUDED.nom_gran_grupo
           WHERE g.nom_gran_grupo IS DISTINCT FROM EXCLUDED.nom_gran_grupo
           RETURNING (xmax = 0) AS insertada`,
          [cod, nom],
        );
        this.contarUpsert(result, filas, 1);
      } catch (err) {
        result.errors.push(`Gran grupo ${cod}: ${err.message}`);
      }
    }

    // Insert Subgrupo Principal
    for (const [cod, val] of subPrincipales) {
      try {
        const filas = await this.dataSource.query(
          `INSERT INTO cuoc_subgrupo_principal AS s (cod_subgrupo_p, nom_subgrupo_p, cod_gran_grupo) VALUES ($1, $2, $3)
           ON CONFLICT (cod_subgrupo_p) DO UPDATE SET nom_subgrupo_p = EXCLUDED.nom_subgrupo_p, cod_gran_grupo = EXCLUDED.cod_gran_grupo
           WHERE (s.nom_subgrupo_p, s.cod_gran_grupo) IS DISTINCT FROM (EXCLUDED.nom_subgrupo_p, EXCLUDED.cod_gran_grupo)
           RETURNING (xmax = 0) AS insertada`,
          [cod, val.nom, val.codGg],
        );
        this.contarUpsert(result, filas, 1);
      } catch (err) {
        result.errors.push(`Subgrupo principal ${cod}: ${err.message}`);
      }
    }

    // Insert Subgrupo
    for (const [cod, val] of subgrupos) {
      try {
        const filas = await this.dataSource.query(
          `INSERT INTO cuoc_subgrupo AS s (cod_subgrupo_c, nom_subgrupo_c, cod_subgrupo_p) VALUES ($1, $2, $3)
           ON CONFLICT (cod_subgrupo_c) DO UPDATE SET nom_subgrupo_c = EXCLUDED.nom_subgrupo_c, cod_subgrupo_p = EXCLUDED.cod_subgrupo_p
           WHERE (s.nom_subgrupo_c, s.cod_subgrupo_p) IS DISTINCT FROM (EXCLUDED.nom_subgrupo_c, EXCLUDED.cod_subgrupo_p)
           RETURNING (xmax = 0) AS insertada`,
          [cod, val.nom, val.codSp],
        );
        this.contarUpsert(result, filas, 1);
      } catch (err) {
        result.errors.push(`Subgrupo ${cod}: ${err.message}`);
      }
    }

    // Insert Grupo Primario
    for (const [cod, val] of gruposPrimarios) {
      try {
        const filas = await this.dataSource.query(
          `INSERT INTO cuoc_grupo_primario AS gp (cod_grupo_prim, nom_grupo_prim, cod_subgrupo_c) VALUES ($1, $2, $3)
           ON CONFLICT (cod_grupo_prim) DO UPDATE SET nom_grupo_prim = EXCLUDED.nom_grupo_prim, cod_subgrupo_c = EXCLUDED.cod_subgrupo_c
           WHERE (gp.nom_grupo_prim, gp.cod_subgrupo_c) IS DISTINCT FROM (EXCLUDED.nom_grupo_prim, EXCLUDED.cod_subgrupo_c)
           RETURNING (xmax = 0) AS insertada`,
          [cod, val.nom, val.codSg],
        );
        this.contarUpsert(result, filas, 1);
      } catch (err) {
        result.errors.push(`Grupo primario ${cod}: ${err.message}`);
      }
    }

    result.message = this.msg(result);
    this.logger.log(`[CUOC-Bulk] Jerarquía: ${this.msg(result)}`);
    return result;
  }

  // ── 6. OCUPACIONES ──
  private async processOcupaciones(workbook: XLSX.WorkBook): Promise<SheetResult> {
    const ws = this.findSheet(workbook, DEFINICIONES_CUOC.ocupacion.hojas);
    const result: SheetResult = {
      sheet: 'Ocupaciones',
      tableName: 'cuoc_ocupacion',
      message: '',
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    if (!ws) {
      result.message = 'Pestaña de ocupaciones no encontrada, se omite.';
      return result;
    }

    // Cargar mapas auxiliares de otras pestañas
    const descMap = new Map<string, string>();
    const wsDesc = this.findSheet(workbook, ['Descripción', 'Descripcion']);
    if (wsDesc) {
      const rowsDesc = this.sheetToRows(wsDesc);
      for (const r of rowsDesc) {
        const cod = this.toStr(this.pick(r, ['Código de la Ocupación', 'cod_ocupacion_cuoc', 'codigo', 'cod_ocupacion']));
        const desc = this.toStr(this.pick(r, ['Descripción de la Ocupación', 'Descripcion de la Ocupacion', 'desc_ocupacion_cuoc', 'descripcion']));
        if (cod) descMap.set(cod, desc);
      }
    }

    const nivelCompetenciaMap = new Map<string, number>();
    const wsNivel = this.findSheet(workbook, ['Nivel Competencia', 'Niveles de competencia']);
    if (wsNivel) {
      const rowsNivel = this.sheetToRows(wsNivel);
      for (const r of rowsNivel) {
        const cod = this.toStr(this.pick(r, ['Código de la Ocupación', 'cod_ocupacion_cuoc', 'codigo', 'cod_ocupacion']));
        const lvl = this.toInt(this.pick(r, ['Nivel de Competencia', 'nivel_competencia', 'nivel']));
        if (cod && lvl !== null) nivelCompetenciaMap.set(cod, lvl);
      }
    }

    const areaCualificacionMap = new Map<string, string>();
    const wsArea = this.findSheet(workbook, ['Área Cual. Principal', 'Area Cual. Principal']);
    if (wsArea) {
      const rowsArea = this.sheetToRows(wsArea);
      for (const r of rowsArea) {
        const cod = this.toStr(this.pick(r, ['Código de la Ocupación', 'cod_ocupacion_cuoc', 'codigo', 'cod_ocupacion']));
        const sigla = this.toStr(this.pick(r, ['SIGLA', 'sigla']));
        if (cod && sigla) areaCualificacionMap.set(cod, sigla);
      }
    }

    const rows = this.sheetToRows(ws);
    this.logger.log(`[CUOC-Bulk] Filas leídas de hoja Ocupaciones: ${rows.length}`);

    const items: {
      cod: string;
      nom: string;
      desc: string;
      codGrupoPrim: string | null;
      codNivel: number | null;
      codArea: string | null;
      estado: boolean;
      /** YYYY-MM-DD; null si el Excel no la trae (y entonces no se pone ninguna). */
      fechaRegistro: string | null;
      fechaInactivacion: string | null;
      /** null si el Excel no trae la columna: no se borra lo que ya haya. */
      codAnte: string | null;
      trazabilidad: string | null;
    }[] = [];

    let skippedBecauseMissingCode = 0;

    for (const row of rows) {
      const cod = this.toStr(
        this.pick(row, ['Código de la Ocupación', 'codigodelaocupacion', 'cod_ocupacion_cuoc', 'codigo', 'Código', 'Codigo', 'cod_ocupacion']),
      );
      if (!cod) {
        skippedBecauseMissingCode++;
        continue;
      }

      const nom = this.toStr(
        this.pick(row, [
          'Nombre de la Ocupación',
          'nombredelaocupacion',
          'nom_ocupacion_cuoc',
          'nombre_ocupacion',
          'nombre',
          'Nombre',
          'Name',
          'ocupacion'
        ]),
      );
      if (!nom) continue;

      // La plantilla oficial reparte descripción, nivel y área en hojas
      // aparte; el export por tablas los trae en la misma fila.
      const desc =
        descMap.get(cod) ||
        this.toStr(this.pick(row, ['Descripción de la Ocupación', 'Descripcion de la Ocupacion', 'desc_ocupacion_cuoc']));
      const codNivel =
        nivelCompetenciaMap.get(cod) || this.toInt(this.pick(row, ['Nivel de Competencia', 'cod_nivel_cuoc'])) || null;
      const codArea =
        areaCualificacionMap.get(cod) || this.toStr(this.pick(row, ['area_cual', 'codigo_area_cuoc'])) || null;
      const codGrupoPrim = this.toStr(
        this.pick(row, ['Código del Grupo Primario', 'codigodelgrupoprimario', 'cod_grupo_prim', 'cod_gp', 'Grupo primario', 'grupo_primario']),
      );

      items.push({
        cod,
        nom,
        desc,
        codGrupoPrim,
        codNivel,
        codArea,
        // Sin columna de estado (plantilla oficial), la ocupación queda activa.
        estado: this.toEstado(this.pick(row, ['estado', 'Estado'])) !== 0,
        fechaRegistro: this.toFecha(this.pick(row, ['fecha_registro', 'Fecha de registro', 'fecha registro'])),
        fechaInactivacion: this.toFecha(this.pick(row, ['fecha_inactivacion', 'Fecha de inactivación', 'fecha inactivacion'])),
        codAnte: this.toStr(this.pick(row, ['cod_ante_ocupacion_cuoc', 'Código anterior', 'codigo_anterior'])) || null,
        trazabilidad: this.toStr(this.pick(row, ['trazabilidad', 'Trazabilidad'])) || null,
      });
    }

    if (skippedBecauseMissingCode > 0) {
      this.logger.warn(
        `[CUOC-Bulk] Se ignoraron ${skippedBecauseMissingCode} filas sin código de ocupación.`,
      );
    }

    this.logger.log(`[CUOC-Bulk] Total ítems a insertar en cuoc_ocupacion: ${items.length}`);

    // Fetch denormalized names and FK existence
    const areaRows = await this.dataSource.query('SELECT codigo, descripcion FROM cuoc_area_cualificacion');
    const areaMap = new Map<string, string>(areaRows.map((r: any) => [r.codigo, r.descripcion]));
    const areaExists = new Set(areaRows.map((r: any) => r.codigo));

    const nivelRows = await this.dataSource.query(
      'SELECT cod_nivel, nombre_nivel FROM cuoc_nivel_competencia',
    );
    const nivelMap = new Map<number, string>(
      nivelRows.map((r: any) => [r.cod_nivel, r.nombre_nivel]),
    );
    const nivelExists = new Set(nivelRows.map((r: any) => r.cod_nivel));

    const gpRows = await this.dataSource.query('SELECT cod_grupo_prim FROM cuoc_grupo_primario');
    const gpExists = new Set(gpRows.map((r: any) => r.cod_grupo_prim));

    const validItems: typeof items = [];
    for (const item of items) {
      if (!gpExists.has(item.codGrupoPrim ?? '')) {
        result.skipped++;
        result.errors.push(`Ocupación ${item.cod}: cod_grupo_prim inválido o ausente (${item.codGrupoPrim ?? 'null'})`);
        continue;
      }
      if (!nivelExists.has(item.codNivel ?? -1)) {
        result.skipped++;
        result.errors.push(`Ocupación ${item.cod}: cod_nivel_cuoc inválido o ausente (${item.codNivel ?? 'null'})`);
        continue;
      }
      if (!areaExists.has(item.codArea ?? '')) {
        result.skipped++;
        result.errors.push(`Ocupación ${item.cod}: codigo_area_cuoc inválido o ausente (${item.codArea ?? 'null'})`);
        continue;
      }
      validItems.push(item);
    }

    for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
      const batch = validItems.slice(i, i + BATCH_SIZE);
      try {
        const values = batch
          .map((_, idx) => {
            const b = idx * 13;
            return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9},
                     $${b + 10}::date, $${b + 11}::date, $${b + 12}, $${b + 13})`;
          })
          .join(', ');
        const params = batch.flatMap((o) => [
          o.cod,
          o.nom,
          o.desc,
          o.estado,
          o.codGrupoPrim,
          o.codNivel,
          o.codNivel !== null ? nivelMap.get(o.codNivel) ?? null : null,
          o.codArea,
          areaMap.get(o.codArea ?? '') ?? null,
          o.fechaRegistro,
          o.fechaInactivacion,
          o.codAnte,
          o.trazabilidad,
        ]);
        const filas = await this.dataSource.query(
          `INSERT INTO cuoc_ocupacion AS o (
             cod_ocupacion_cuoc, nom_ocupacion_cuoc, desc_ocupacion_cuoc, estado,
             cod_grupo_prim, cod_nivel_cuoc, nombre_nivel, codigo_area_cuoc, nombre,
             fecha_registro, fecha_inactivacion, cod_ante_ocupacion_cuoc, trazabilidad
           ) VALUES ${values}
           ON CONFLICT (cod_ocupacion_cuoc) DO UPDATE SET
             nom_ocupacion_cuoc = EXCLUDED.nom_ocupacion_cuoc,
             desc_ocupacion_cuoc = EXCLUDED.desc_ocupacion_cuoc,
             estado = EXCLUDED.estado,
             cod_grupo_prim = EXCLUDED.cod_grupo_prim,
             cod_nivel_cuoc = EXCLUDED.cod_nivel_cuoc,
             nombre_nivel = EXCLUDED.nombre_nivel,
             codigo_area_cuoc = EXCLUDED.codigo_area_cuoc,
             nombre = EXCLUDED.nombre,
             -- Fechas, código anterior y trazabilidad salen SOLO del Excel: si la
             -- hoja no los trae, no se inventan y se conserva lo que ya hubiera.
             fecha_registro = COALESCE(EXCLUDED.fecha_registro, o.fecha_registro),
             fecha_inactivacion = COALESCE(EXCLUDED.fecha_inactivacion, o.fecha_inactivacion),
             cod_ante_ocupacion_cuoc = COALESCE(EXCLUDED.cod_ante_ocupacion_cuoc, o.cod_ante_ocupacion_cuoc),
             trazabilidad = COALESCE(EXCLUDED.trazabilidad, o.trazabilidad)
           WHERE (o.nom_ocupacion_cuoc, o.desc_ocupacion_cuoc, o.estado, o.cod_grupo_prim,
                  o.cod_nivel_cuoc, o.nombre_nivel, o.codigo_area_cuoc, o.nombre)
             IS DISTINCT FROM
                 (EXCLUDED.nom_ocupacion_cuoc, EXCLUDED.desc_ocupacion_cuoc, EXCLUDED.estado, EXCLUDED.cod_grupo_prim,
                  EXCLUDED.cod_nivel_cuoc, EXCLUDED.nombre_nivel, EXCLUDED.codigo_area_cuoc, EXCLUDED.nombre)
              OR (EXCLUDED.fecha_registro IS NOT NULL AND EXCLUDED.fecha_registro IS DISTINCT FROM o.fecha_registro)
              OR (EXCLUDED.fecha_inactivacion IS NOT NULL AND EXCLUDED.fecha_inactivacion IS DISTINCT FROM o.fecha_inactivacion)
              OR (EXCLUDED.cod_ante_ocupacion_cuoc IS NOT NULL AND EXCLUDED.cod_ante_ocupacion_cuoc IS DISTINCT FROM o.cod_ante_ocupacion_cuoc)
              OR (EXCLUDED.trazabilidad IS NOT NULL AND EXCLUDED.trazabilidad IS DISTINCT FROM o.trazabilidad)
           RETURNING (xmax = 0) AS insertada`,
          params,
        );
        this.contarUpsert(result, filas, batch.length);
      } catch (err) {
        result.errors.push(`Lote ocupaciones ${i}: ${err.message}`);
      }
    }

    // La 26590 ya no viene en la CUOC 2026, pero los archivos de correlativa la
    // usan tal cual: no se borra ni se reescribe la correlativa a otro código.
    // (Si falta, la carga de correlativa la registra.)

    // Purgar denominaciones y registros obsoletos (00000). Solo lo que nada
    // referencia: borrar a ciegas fallaba (FK RESTRICT) en cada cargue,
    // dejando un «query failed» en el log aunque no hubiera nada que hacer.
    try {
      await this.dataSource.query(`
        DELETE FROM clasificacion.cuoc_denominacion d
         WHERE d.cod_ocupacion_cuoc = '00000'
           AND NOT EXISTS (SELECT 1 FROM clasificacion.correlativa_denominacion c WHERE c.cod_denominacion_cuoc = d.cod_denominacion)
      `);
      await this.dataSource.query(`
        DELETE FROM clasificacion.cuoc_ocupacion o
         WHERE o.cod_ocupacion_cuoc = '00000'
           AND NOT EXISTS (SELECT 1 FROM clasificacion.cuoc_denominacion x WHERE x.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc)
           AND NOT EXISTS (SELECT 1 FROM clasificacion.cuoc_funciones x WHERE x.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc)
           AND NOT EXISTS (SELECT 1 FROM clasificacion.cuoc_destreza x WHERE x.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc)
           AND NOT EXISTS (SELECT 1 FROM clasificacion.cuoc_reg_conocimientos x WHERE x.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc)
           AND NOT EXISTS (SELECT 1 FROM clasificacion.cuoc_ocupacion_afin x WHERE x.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc)
           AND NOT EXISTS (SELECT 1 FROM clasificacion.correlativa_ocupacion x WHERE x.cuoc_ocupacion_cuoc = o.cod_ocupacion_cuoc)
           AND NOT EXISTS (SELECT 1 FROM clasificacion.comparativa_ocupacion x WHERE x.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc)
      `);
    } catch (err) {
      this.logger.warn(`No se pudo eliminar el código 00000: ${err.message}`);
    }

    result.message = this.msg(result);
    this.logger.log(`[CUOC-Bulk] Ocupaciones: ${this.msg(result)}`);
    return result;
  }

  // ── 7. FUNCIONES ──
  private async processFunciones(workbook: XLSX.WorkBook): Promise<SheetResult> {
    const ws = this.findSheet(workbook, [
      'Funciones - C.U.O.C.',
      'Funciones',
      'funciones_cuoc',
      'cuoc_funciones',
    ]);
    const result: SheetResult = {
      sheet: 'Funciones',
      tableName: 'cuoc_funciones',
      message: '',
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    if (!ws) {
      result.message = 'Pestaña de funciones no encontrada, se omite.';
      return result;
    }
    const rows = this.sheetToRows(ws);

    // Contador de respaldo para filas sin consecutivo en el excel: no
    // debe pisar el código real que sí viene en la hoja.
    let seqCounter = 1;

    // Ocupación → (texto de la función → código), tal como viene en el Excel.
    const delArchivo = new Map<string, Map<string, string>>();
    for (const row of rows) {
      const codOcup = this.toStr(
        this.pick(row, ['Código de la Ocupación', 'codigodelaocupacion', 'cod_ocupacion_cuoc', 'codigo_ocupacion', 'Código ocupación', 'cod_ocupacion']),
      );
      const nomFuncion = this.toStr(
        this.pick(row, [
          'Funciones de la Ocupación',
          'funcionesdelaocupacion',
          'nom_funcion_cuoc',
          'nombre_funcion',
          'Nombre función',
          'Funcion',
          'funcion',
          'descripcion',
        ]),
      );
      if (!codOcup || !nomFuncion) continue;
      const funciones = delArchivo.get(codOcup) ?? new Map<string, string>();
      delArchivo.set(codOcup, funciones);
      if (funciones.has(nomFuncion)) {
        result.skipped++; // la misma función dos veces en la misma ocupación
        continue;
      }
      // Código que se guarda en `cod_funcion_cuoc` y muestra la consulta: el
      // consecutivo de la función DENTRO de su ocupación (1, 2, 3…), no el `id`
      // corrido de todo el libro que trae el export por tablas.
      const codigo = this.toStr(
        this.pick(row, [
          'Consecutivo de la Función',
          'Consecutivo de la Funcion',
          'Consecutivo',
          'consecutivo',
        ]),
      );
      funciones.set(nomFuncion, codigo || String(seqCounter++));
    }

    // Antes solo se insertaba lo que no existía con el mismo texto: una función
    // reescrita quedaba dos veces (la vieja y la nueva). Ahora cada ocupación de
    // la hoja queda igual al Excel: se reutiliza la fila existente (corrigiendo
    // su código, texto o estado), se inserta lo nuevo y se desactiva lo que ya
    // no viene. Las ocupaciones que no están en la hoja (p. ej. las copias de
    // Análisis) no se tocan.
    const existentes: { codigo: number; ocup: string; codFuncion: string | null; texto: string | null; estado: number | null }[] =
      await this.dataSource.query(
        `SELECT codigo, cod_ocupacion_cuoc AS ocup, cod_funcion_cuoc AS "codFuncion",
                nom_funcion_cuoc AS texto, estado
           FROM cuoc_funciones
          WHERE cod_ocupacion_cuoc = ANY($1::text[])
          ORDER BY codigo`,
        [[...delArchivo.keys()]],
      );

    const aCorregir: { codigo: number; codFuncion: string; texto: string }[] = [];
    const reutilizadas = new Set<number>();
    const pendientes = new Map([...delArchivo].map(([ocup, f]) => [ocup, new Map(f)]));
    const reutilizar = (f: (typeof existentes)[number], texto: string, codFuncion: string) => {
      reutilizadas.add(f.codigo);
      pendientes.get(f.ocup)!.delete(texto);
      if (f.codFuncion !== codFuncion || (f.texto ?? '').trim() !== texto || (f.estado ?? 1) !== 1) {
        aCorregir.push({ codigo: f.codigo, codFuncion, texto });
      } else {
        result.skipped++;
      }
    };
    // Por texto, en dos pasadas: primero la fila que ya tiene el código
    // correcto, para no "mover" una función bien numerada si hay otra copia
    // con el mismo texto.
    for (const mismoCodigo of [true, false]) {
      for (const f of existentes) {
        if (reutilizadas.has(f.codigo)) continue;
        const texto = (f.texto ?? '').trim();
        const codFuncion = pendientes.get(f.ocup)?.get(texto);
        if (codFuncion === undefined || (mismoCodigo && f.codFuncion !== codFuncion)) continue;
        reutilizar(f, texto, codFuncion);
      }
    }
    // Por código, entre lo que sobró de ambos lados: la misma función con otra
    // redacción se actualiza en su fila en vez de duplicarse.
    for (const f of existentes) {
      if (reutilizadas.has(f.codigo) || !f.codFuncion) continue;
      const porOcupacion = pendientes.get(f.ocup);
      const texto = [...(porOcupacion ?? [])].find(([, cod]) => cod === f.codFuncion)?.[0];
      if (texto !== undefined) reutilizar(f, texto, f.codFuncion);
    }
    const aDesactivar = existentes
      .filter((f) => !reutilizadas.has(f.codigo) && (f.estado ?? 1) !== 0)
      .map((f) => f.codigo);
    const newItems = [...pendientes].flatMap(([codOcup, f]) =>
      [...f].map(([nomFuncion, codFuncion]) => ({ codFuncion, nomFuncion, codOcup })),
    );

    for (let i = 0; i < aCorregir.length; i += BATCH_SIZE) {
      const batch = aCorregir.slice(i, i + BATCH_SIZE);
      try {
        await this.dataSource.query(
          `UPDATE cuoc_funciones f
              SET cod_funcion_cuoc = v.cod_funcion, nom_funcion_cuoc = v.texto, estado = 1, fecha_inactivo = NULL
             FROM unnest($1::int[], $2::text[], $3::text[]) AS v(codigo, cod_funcion, texto)
            WHERE f.codigo = v.codigo`,
          [batch.map((f) => f.codigo), batch.map((f) => f.codFuncion), batch.map((f) => f.texto)],
        );
      } catch (err) {
        result.errors.push(`Lote funciones (corrección) ${i}: ${err.message}`);
      }
    }

    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      try {
        const values = batch
          .map((_, idx) => {
            const b = idx * 4;
            return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`;
          })
          .join(', ');
        const params = batch.flatMap((f) => [f.codFuncion, f.nomFuncion, f.codOcup, 1]);
        await this.dataSource.query(
          `INSERT INTO cuoc_funciones (cod_funcion_cuoc, nom_funcion_cuoc, cod_ocupacion_cuoc, estado) VALUES ${values}`,
          params,
        );
        result.inserted += batch.length;
      } catch (err) {
        result.errors.push(`Lote funciones ${i}: ${err.message}`);
      }
    }

    if (aCorregir.length > 0) {
      result.updated = (result.updated ?? 0) + aCorregir.length;
      (result.changes ??= []).push(`Se actualizaron ${aCorregir.length} función(es) (código, texto o estado) según el Excel.`);
    }
    // Con errores no se desactiva nada: una fila que no se pudo escribir
    // parecería "retirada" y se apagaría por error.
    if (aDesactivar.length > 0 && result.errors.length > 0) {
      (result.warnings ??= []).push(
        `No se desactivaron ${aDesactivar.length} función(es) ausentes del Excel porque la hoja tuvo errores; corrija el archivo y vuelva a cargarlo.`,
      );
    } else if (aDesactivar.length > 0) {
      await this.dataSource.query(
        `UPDATE cuoc_funciones SET estado = 0, fecha_inactivo = now() WHERE codigo = ANY($1::int[])`,
        [aDesactivar],
      );
      result.updated = (result.updated ?? 0) + aDesactivar.length;
      (result.changes ??= []).push(`Se desactivaron ${aDesactivar.length} función(es) que ya no vienen en el Excel.`);
    }
    result.message = this.msg(result);
    this.logger.log(`[CUOC-Bulk] Funciones: ${this.msg(result)}`);
    return result;
  }

  // ── 8. DENOMINACIONES ──
  private async processDenominaciones(workbook: XLSX.WorkBook): Promise<SheetResult> {
    const ws = this.findSheet(workbook, [
      'Denominaciones - C.U.O.C.',
      'Denominaciones',
      'denominaciones_cuoc',
      'cuoc_denominaciones',
      'cuoc_denominacion',
    ]);
    const result: SheetResult = {
      sheet: 'Denominaciones',
      tableName: 'cuoc_denominacion',
      message: '',
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    if (!ws) {
      result.message = 'Pestaña de denominaciones no encontrada, se omite.';
      return result;
    }
    const rows = this.sheetToRows(ws);
    const existing: { cod_denominacion: string; estado: number }[] = await this.dataSource.query(
      'SELECT cod_denominacion, estado FROM cuoc_denominacion',
    );
    const estadoActual = new Map(existing.map((d) => [d.cod_denominacion, d.estado]));
    const vistos = new Set<string>();

    const items: {
      codDenominacion: string;
      nomDenominacion: string;
      codOcup: string;
      fuente: string | null;
      estado: number;
    }[] = [];
    for (const row of rows) {
      const codDenominacion = this.toStr(
        this.pick(row, ['Código de la Denominación', 'codigodeladenominacion', 'cod_denominacion', 'codigo_denominacion', 'Código denominación', 'codigo']),
      );
      if (!codDenominacion) continue;
      // Un mismo código dos veces en el archivo haría fallar el lote entero
      // ("ON CONFLICT DO UPDATE command cannot affect row a second time").
      if (vistos.has(codDenominacion)) {
        result.skipped++;
        continue;
      }
      const nomDenominacion = this.toStr(
        this.pick(row, [
          'Nombre de la Denominación',
          'nombredeladenominacion',
          'nom_denominacion',
          'nombre_denominacion',
          'Nombre denominación',
          'denominacion',
          'nombre',
        ]),
      );
      if (!nomDenominacion) continue;
      const codOcup = this.toStr(
        this.pick(row, ['Código de la Ocupación', 'codigodelaocupacion', 'cod_ocupacion_cuoc', 'codigo_ocupacion', 'Código ocupación', 'cod_ocupacion']),
      );
      if (!codOcup) continue;
      vistos.add(codDenominacion);
      const fuente = this.toStr(this.pick(row, ['fuente_denom', 'fuente', 'Fuente', 'fuente_denominacion_cuoc']));
      // Si la hoja no trae estado, no se pisa el que ya tenga la denominación
      // (p. ej. una inactivada a mano); las nuevas entran activas.
      const estadoExcel = this.toEstado(this.pick(row, ['estado', 'Estado', 'activa', 'activo']));
      items.push({
        codDenominacion,
        nomDenominacion,
        codOcup,
        fuente: fuente || null,
        estado: estadoExcel ?? estadoActual.get(codDenominacion) ?? 1,
      });
    }

    // Igual que el resto de hojas CUOC: upsert por código, para que volver a
    // subir el archivo corregido actualice los datos en vez de ignorarlos. El
    // WHERE evita reescribir filas idénticas, y `xmax = 0` distingue en el
    // RETURNING las insertadas de las actualizadas.
    let actualizadas = 0;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      try {
        const values = batch
          .map((_, idx) => {
            const b = idx * 5;
            return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::smallint)`;
          })
          .join(', ');
        const params = batch.flatMap((d) => [d.codDenominacion, d.nomDenominacion, d.codOcup, d.fuente, d.estado]);
        const filas: { insertada: boolean }[] = await this.dataSource.query(
          `INSERT INTO cuoc_denominacion AS d (cod_denominacion, nom_denominacion, cod_ocupacion_cuoc, fuente_denom, estado)
           VALUES ${values}
           ON CONFLICT (cod_denominacion) DO UPDATE SET
             nom_denominacion = EXCLUDED.nom_denominacion,
             cod_ocupacion_cuoc = EXCLUDED.cod_ocupacion_cuoc,
             fuente_denom = COALESCE(EXCLUDED.fuente_denom, d.fuente_denom),
             estado = EXCLUDED.estado
           WHERE (d.nom_denominacion, d.cod_ocupacion_cuoc, d.fuente_denom, d.estado)
             IS DISTINCT FROM
             (EXCLUDED.nom_denominacion, EXCLUDED.cod_ocupacion_cuoc, COALESCE(EXCLUDED.fuente_denom, d.fuente_denom), EXCLUDED.estado)
           RETURNING (xmax = 0) AS insertada`,
          params,
        );
        const insertadas = filas.filter((f) => f.insertada).length;
        result.inserted += insertadas;
        actualizadas += filas.length - insertadas;
        result.skipped += batch.length - filas.length;
      } catch (err) {
        result.errors.push(`Lote denominaciones ${i}: ${err.message}`);
      }
    }

    // Lo que ya no viene en el Excel se desactiva (estado 0) en vez de borrarse:
    // la correlativa referencia las denominaciones, y si vuelven en un Excel
    // posterior el upsert de arriba las reactiva. Mismo criterio que CNO
    // (`inactivarAusentes`): solo ocupaciones de la hoja, y nada si hubo errores.
    const ocupacionesHoja = [...new Set(items.map((d) => d.codOcup))];
    if (ocupacionesHoja.length > 0 && result.errors.length > 0) {
      (result.warnings ??= []).push(
        'No se desactivaron las denominaciones ausentes del Excel porque la hoja tuvo errores; corrija el archivo y vuelva a cargarlo.',
      );
    } else if (ocupacionesHoja.length > 0) {
      const desactivadas = this.filasDevueltas<{ codigo: string }>(
        await this.dataSource.query(
          `UPDATE cuoc_denominacion SET estado = 0
            WHERE cod_ocupacion_cuoc = ANY($1::text[])
              AND COALESCE(estado, 1) <> 0
              AND NOT (cod_denominacion = ANY($2::text[]))
          RETURNING cod_denominacion AS codigo`,
          [ocupacionesHoja, [...vistos]],
        ),
      );
      if (desactivadas.length > 0) {
        actualizadas += desactivadas.length;
        (result.changes ??= []).push(
          `Se desactivaron ${desactivadas.length} denominación(es) que ya no vienen en el Excel.`,
        );
      }
    }
    result.updated = actualizadas;
    result.message = this.msg(result);
    this.logger.log(
      `[CUOC-Bulk] Denominaciones: ${result.inserted} nuevas, ${actualizadas} actualizadas, ${result.skipped} sin cambios`,
    );
    return result;
  }

  // ── 9. REG CONOCIMIENTOS ──
  private async processRegConocimientos(workbook: XLSX.WorkBook): Promise<SheetResult> {
    // El export por tablas separa la relación (`cuoc_reg_conocimientos`) del
    // catálogo (`cuoc_conocimientos`); la plantilla oficial trae ambas cosas
    // en la misma hoja «Conocimientos». Va primero para no leer el catálogo.
    const ws = this.findSheet(workbook, [
      'cuoc_reg_conocimientos',
      'Conocimientos - C.U.O.C.',
      'Conocimientos',
      'conocimientos_cuoc',
    ]);
    const result: SheetResult = {
      sheet: 'RegConocimientos',
      tableName: 'cuoc_reg_conocimientos',
      message: '',
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    if (!ws) {
      result.message = 'Pestaña de conocimientos no encontrada, se omite.';
      return result;
    }
    const rows = this.sheetToRows(ws);
    const existing = await this.dataSource.query(
      'SELECT cod_ocupacion_cuoc, cod_conocimiento FROM cuoc_reg_conocimientos',
    );
    const existingSet = new Set(
      existing.map((r: any) => `${r.cod_ocupacion_cuoc}|${r.cod_conocimiento}`),
    );

    const newItems: { codOcup: string; codConoc: number }[] = [];
    const paresArchivo = new Set<string>();
    for (const row of rows) {
      const codOcup = this.toStr(
        this.pick(row, ['Código de la Ocupación', 'codigodelaocupacion', 'cod_ocupacion_cuoc', 'codigo_ocupacion', 'Código ocupación', 'cod_ocupacion']),
      );
      const codConoc = this.toInt(
        this.pick(row, ['ID', 'id', 'cod_conocimiento', 'codigo_conocimiento', 'Código del conocimiento']),
      );
      if (!codOcup || codConoc === null) continue;
      const key = `${codOcup}|${codConoc}`;
      paresArchivo.add(key);
      if (existingSet.has(key)) {
        result.skipped++;
        continue;
      }
      existingSet.add(key);
      newItems.push({ codOcup, codConoc });
    }

    // Fetch knowledge names
    const concRows = await this.dataSource.query('SELECT cod_conocimiento, nomb_conocimiento FROM cuoc_conocimiento');
    const concMap = new Map<number, string>(concRows.map((r: any) => [r.cod_conocimiento, r.nomb_conocimiento]));

    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      try {
        const values = batch
          .map((_, idx) => {
            const b = idx * 3;
            return `($${b + 1}, $${b + 2}, $${b + 3})`;
          })
          .join(', ');
        const params = batch.flatMap((r) => [r.codOcup, r.codConoc, concMap.get(r.codConoc) ?? null]);
        await this.dataSource.query(
          `INSERT INTO cuoc_reg_conocimientos (cod_ocupacion_cuoc, cod_conocimiento, nomb_conocimiento) VALUES ${values}`,
          params,
        );
        result.inserted += batch.length;
      } catch (err) {
        result.errors.push(`Lote reg_conocimientos ${i}: ${err.message}`);
      }
    }
    await this.quitarRelacionesAusentes(
      result,
      'cuoc_reg_conocimientos',
      'cod_conocimiento',
      paresArchivo,
      'conocimiento(s) de ocupación',
    );
    result.message = this.msg(result);
    this.logger.log(`[CUOC-Bulk] Conocimientos por ocupación: ${this.msg(result)}`);
    return result;
  }

  // ── 10. OCUPACIONES AFINES ──
  private async processOcupacionesAfines(workbook: XLSX.WorkBook): Promise<SheetResult> {
    const ws = this.findSheet(workbook, [
      'Ocupaciones afines - C.U.O.C.',
      'Ocupaciones afines',
      'Ocupaciones_afines',
      'ocupaciones_afines',
      'Relacionadas',
      'cuoc_reg_ocup_afin',
      'cuoc_ocupacion_afin',
    ]);
    const result: SheetResult = {
      sheet: 'Ocupaciones afines',
      tableName: 'cuoc_ocupacion_afin',
      message: '',
      inserted: 0,
      skipped: 0,
      errors: [],
    };
    if (!ws) {
      result.message = 'Pestaña de ocupaciones afines no encontrada, se omite.';
      return result;
    }
    const rows = this.sheetToRows(ws);
    const existing = await this.dataSource.query(
      'SELECT cod_ocupacion_cuoc, codigo_ocupacion FROM cuoc_ocupacion_afin',
    );
    const existingSet = new Set(existing.map((a: any) => `${a.cod_ocupacion_cuoc}|${a.codigo_ocupacion}`));
    const newItems: {
      codOcup: string;
      nombreOcupacion: string;
      codigoOcupacion: string;
      nombreCnoAfin: string;
    }[] = [];
    const paresArchivo = new Set<string>();

    for (const row of rows) {
      const codOcup = this.toStr(
        this.pick(row, ['Código de la Ocupación', 'codigodelaocupacion', 'cod_ocupacion_cuoc', 'codigo_ocupacion', 'Código ocupación', 'cod_ocupacion']),
      );
      const nombreOcupacion = this.toStr(
        this.pick(row, ['Nombre de la Ocupación', 'nombredelaocupacion', 'nombre_ocupacion', 'nombre', 'Nombre ocupación', 'nom_ocupacion']),
      );
      const codigoOcupacion = this.toStr(
        this.pick(row, ['Código de la Ocupación Afin', 'codigodelaocupacionafin', 'codigo_ocupacion_afin', 'codigo_afin', 'Código afin', 'cod_afin']),
      );
      const nombreCnoAfin = this.toStr(
        this.pick(row, ['Nombre de la Ocupación Afin', 'nombredelaocupacionafin', 'nombre_cno_afin', 'nombre_afin', 'Nombre CNO afin', 'nom_cno_afin']),
      );
      if (!codOcup) continue;
      if (!codigoOcupacion) {
        result.skipped++;
        continue;
      }
      const key = `${codOcup}|${codigoOcupacion}`;
      paresArchivo.add(key);
      if (existingSet.has(key)) {
        result.skipped++;
        continue;
      }
      existingSet.add(key);
      newItems.push({ codOcup, nombreOcupacion, codigoOcupacion, nombreCnoAfin });
    }

    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      try {
        const values = batch
          .map((_, idx) => {
            const b = idx * 4;
            return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`;
          })
          .join(', ');
        const params = batch.flatMap((a) => [a.codOcup, a.nombreOcupacion, a.codigoOcupacion, a.nombreCnoAfin]);
        await this.dataSource.query(
          `INSERT INTO cuoc_ocupacion_afin (cod_ocupacion_cuoc, nombre_ocupacion, codigo_ocupacion, nombre_cno_afin) VALUES ${values}`,
          params,
        );
        result.inserted += batch.length;
      } catch (err) {
        result.errors.push(`Lote ocupaciones afines ${i}: ${err.message}`);
      }
    }
    await this.quitarRelacionesAusentes(result, 'cuoc_ocupacion_afin', 'codigo_ocupacion', paresArchivo, 'ocupación(es) afín(es)');
    result.message = this.msg(result);
    this.logger.log(`[CUOC-Bulk] Ocupaciones afines: ${this.msg(result)}`);
    return result;
  }
}
