import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { resincronizarSecuencia } from '../../cno/utils/cno-secuencia.util';
import * as XLSX from 'xlsx';

/**
 * Carga de correlativas POR TIPO: denominación, ocupación o conocimiento.
 *
 * Difiere del cargue histórico (`CorrelativaService.processExcel`, que sigue
 * sembrando la base al arrancar desde el Excel oficial de dos hojas) en tres
 * cosas:
 *
 * 1. Un archivo = un tipo. El usuario elige qué está cargando y el archivo se
 *    valida contra ESE tipo; nunca se mezclan tablas.
 * 2. Las columnas se reconocen por su ENCABEZADO, no por su posición. El
 *    archivo puede ser la hoja oficial (encabezados en la fila 7) o un export
 *    plano (encabezados en la fila 1): se busca la fila que más encabezados
 *    esperados contenga.
 * 3. Si faltan columnas obligatorias se rechaza TODO el archivo antes de tocar
 *    la base. No hay importación parcial de un archivo que no corresponde.
 *
 * Reemplaza el contenido completo de la tabla del tipo elegido (TRUNCATE +
 * INSERT en una transacción), igual que hacía el cargue histórico con las
 * suyas. Lo que el archivo trae y el catálogo no tiene se REGISTRA en esa
 * misma transacción en vez de omitir la fila: ocupaciones, denominaciones y
 * conocimientos, CNO y CUOC. Los códigos del archivo se guardan tal cual.
 *
 * Una ocupación exige campos que la correlativa no trae (CUOC: grupo primario,
 * nivel y área; CNO: área de desempeño y nivel); se deducen del propio
 * catálogo (ver `planificarOcupaciones`).
 */

export type TipoCarga = 'denominacion' | 'ocupacion' | 'conocimiento';

export const TIPOS_CARGA: readonly TipoCarga[] = ['denominacion', 'ocupacion', 'conocimiento'];

/** Definición de una columna esperada: clave interna, etiqueta y alias aceptados. */
interface ColumnaEsperada {
  clave: string;
  etiqueta: string;
  /** Encabezados que se aceptan, ya normalizados (ver `normalizar`). */
  alias: string[];
  requerida: boolean;
}

/** Resultado de reconocer los encabezados de un archivo para un tipo. */
export interface ValidacionEncabezados {
  ok: boolean;
  hoja: string;
  /** Fila (1-indexada, como en Excel) donde están los encabezados. */
  filaEncabezados: number;
  /** clave de columna → índice de columna en la hoja. */
  mapeo: Record<string, number>;
  faltantes: string[];
  /**
   * El encabezado se reconoció componiendo varias filas (hoja oficial). En ese
   * formato las celdas del lado CNO van vacías cuando repiten la fila anterior.
   */
  encabezadoAgrupado?: boolean;
  /** Si el archivo parece corresponder a OTRO tipo, cuál. */
  pareceTipo: TipoCarga | null;
  totalFilas: number;
}

export interface ResultadoCarga {
  message: string;
  totalInserted: number;
  totalUpdated: number;
  totalSkipped: number;
  totalErrors: number;
  totalWarnings: number;
  elapsedMs: number;
  sheets: Array<{
    sheet: string;
    tableName: string;
    message: string;
    inserted: number;
    updated: number;
    skipped: number;
    errors: string[];
    skippedDetails: string[];
    warnings: string[];
    /** Lo que se registró en los catálogos porque el archivo lo traía y no existía. */
    changes: string[];
  }>;
}

/** Alta en los catálogos de lo que el archivo trae y no existe; corre en la transacción de la carga. */
type AltaCatalogos = (manager: EntityManager) => Promise<void>;

/** Caracteres invisibles que llegan al copiar texto (p. ej. «laboratorio\u200B»). */
const INVISIBLES = /[\u200B-\u200D\uFEFF]/g;

/** Marca de las ocupaciones que se registraron desde aquí (columna `trazabilidad`). */
const TRAZA_CORRELATIVA = 'Registrada desde la carga de correlativa';

interface PlanOcupaciones {
  /** Se pueden registrar (o ya existen): la fila sigue. */
  existe: (tipo: 'cno' | 'cuoc', codigo: string) => boolean;
  /** Por qué no se puede registrar una que falta. */
  motivo: (tipo: 'cno' | 'cuoc', codigo: string) => string;
  alta: AltaCatalogos;
}

/** «3 nuevas: a, b, c» (hasta 20 códigos; el resto se resume). */
function listaCodigos(codigos: string[]): string {
  const muestra = codigos.slice(0, 20).join(', ');
  return codigos.length > 20 ? `${muestra} y ${codigos.length - 20} más` : muestra;
}

/** Minúsculas, sin tildes, sin signos, espacios colapsados. «C.N.O» → «cno», «C.U.O.C» → «cuoc». */
function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bc n o\b/g, 'cno')
    .replace(/\bc u o c\b/g, 'cuoc');
}

/**
 * Cuántas filas por encima del encabezado se leen como grupos. La hoja oficial
 * lo parte en tres: «C.N.O | C.U.O.C» / «Ocupación | Ocupación» / «Código |
 * Nombre | Código | Nombre».
 */
const FILAS_GRUPO_ENCABEZADO = 2;

/**
 * Columnas por tipo. Las obligatorias son las que la tabla exige (NOT NULL /
 * FK); las demás entran si vienen. `id` se acepta pero se ignora: la PK es
 * serial y la asigna la base.
 */
const COLUMNAS: Record<TipoCarga, ColumnaEsperada[]> = {
  denominacion: [
    { clave: 'id', etiqueta: 'id', alias: ['id', 'id relacion', 'codigo'], requerida: false },
    {
      clave: 'codOcupacionCno',
      etiqueta: 'código ocupación CNO',
      alias: ['codigo ocupacion cno', 'cod ocupacion cno', 'ocupacion cno', 'codigo cno', 'cno ocupacion codigo'],
      requerida: true,
    },
    {
      clave: 'codDenominacionCno',
      etiqueta: 'código denominación CNO',
      alias: ['codigo denominacion cno', 'cod denominacion cno', 'denominacion cno codigo', 'cno denominacion codigo'],
      requerida: true,
    },
    {
      clave: 'descDenominacionCno',
      etiqueta: 'descripción denominación',
      alias: [
        'desc denominacion cno',
        'descripcion denominacion',
        'descripcion denominacion cno',
        'denominacion cno',
        'nombre denominacion cno',
        'nombre denominacion',
        'cno denominacion nombre',
      ],
      requerida: false,
    },
    {
      clave: 'codOcupacionCuoc',
      etiqueta: 'código ocupación CUOC',
      alias: ['codigo ocupacion cuoc', 'cod ocupacion cuoc', 'ocupacion cuoc', 'codigo cuoc', 'cuoc ocupacion codigo'],
      requerida: true,
    },
    {
      // No está en la lista corta del brief, pero la tabla `correlativa_denominacion` la
      // exige (NOT NULL + FK a cuoc_denominacion): sin ella la fila no entra.
      clave: 'codDenominacionCuoc',
      etiqueta: 'código denominación CUOC',
      alias: ['codigo denominacion cuoc', 'cod denominacion cuoc', 'denominacion cuoc codigo', 'cuoc denominacion codigo'],
      requerida: true,
    },
    {
      clave: 'descDenominacionCuoc',
      etiqueta: 'descripción',
      alias: [
        'desc denominacion cuoc',
        'descripcion',
        'descripcion denominacion cuoc',
        'denominacion cuoc',
        'nombre denominacion cuoc',
        'descripcion cuoc',
        'cuoc denominacion nombre',
      ],
      requerida: false,
    },
    { clave: 'estado', etiqueta: 'estado', alias: ['estado', 'activo'], requerida: false },
    {
      clave: 'observacion',
      etiqueta: 'observación',
      alias: ['observacion', 'observaciones', 'comentario', 'nota'],
      requerida: false,
    },
  ],
  ocupacion: [
    { clave: 'id', etiqueta: 'id', alias: ['id', 'codigo'], requerida: false },
    {
      clave: 'codOcupacionCno',
      etiqueta: 'código ocupación CNO',
      alias: ['cno_ocupacion_cno', 'cno ocupacion cno', 'codigo ocupacion cno', 'cod ocupacion cno', 'ocupacion cno', 'codigo cno', 'cno ocupacion codigo'],
      requerida: true,
    },
    {
      clave: 'nombOcupacionCno',
      etiqueta: 'nombre',
      alias: ['nomb ocupacion cno', 'nombre', 'nombre cno', 'nombre ocupacion cno', 'ocupacion', 'denominacion cno', 'nombre ocupacion', 'cno ocupacion nombre'],
      requerida: false,
    },
    {
      // El export real trae esta columna con el mismo prefijo "cno" que la de
      // la izquierda (cno_ocupacion_cuoc), aunque es el código del lado CUOC.
      clave: 'codOcupacionCuoc',
      etiqueta: 'código ocupación CUOC',
      alias: ['cno ocupacion cuoc', 'cuoc_ocupacion_cuoc', 'cuoc ocupacion cuoc', 'codigo ocupacion cuoc', 'cod ocupacion cuoc', 'ocupacion cuoc', 'codigo cuoc', 'cuoc ocupacion codigo'],
      requerida: true,
    },
    {
      clave: 'nombOcupacionCuoc',
      etiqueta: 'nombre CUOC',
      alias: ['nomb ocupacion cuoc', 'nombre cuoc', 'nombre ocupacion cuoc', 'denominacion cuoc', 'descripcion cuoc', 'cuoc ocupacion nombre'],
      requerida: false,
    },
    // Se lee aunque venga vacía: es una columna de correlativa_ocupacion y el
    // archivo oficial (correlativas.xlsx, hoja «Ocupacion») la trae.
    { clave: 'observacion', etiqueta: 'observación', alias: ['observacion', 'observaciones', 'comentario', 'nota'], requerida: false },
  ],
  conocimiento: [
    { clave: 'id', etiqueta: 'id', alias: ['id', 'codigo', 'cod conocimiento'], requerida: false },
    {
      clave: 'codConocimientoCno',
      etiqueta: 'código conocimiento CNO',
      alias: ['codigo conocimiento cno', 'cod conocimiento cno', 'conocimiento cno', 'codigo cno'],
      requerida: true,
    },
    {
      clave: 'nombConocimientoCno',
      etiqueta: 'nombre conocimiento CNO',
      alias: ['nombre conocimiento cno', 'nomb conocimiento cno', 'conocimiento cno nombre', 'nombre cno'],
      requerida: false,
    },
    {
      clave: 'codConocimientoCuoc',
      etiqueta: 'código conocimiento CUOC',
      alias: ['codigo conocimiento cuoc', 'cod conocimiento cuoc', 'conocimiento cuoc', 'codigo cuoc'],
      requerida: true,
    },
    {
      clave: 'nombConocimientoCuoc',
      etiqueta: 'nombre conocimiento CUOC',
      alias: ['nombre conocimiento cuoc', 'nomb conocimiento cuoc', 'conocimiento cuoc nombre', 'nombre cuoc'],
      requerida: false,
    },
    { clave: 'aplica', etiqueta: 'aplicado', alias: ['aplica correl conocimientos', 'aplicado', 'aplica', 'se aplica'], requerida: false },
  ],
};

const TABLA: Record<TipoCarga, string> = {
  denominacion: 'clasificacion.correlativa_denominacion',
  ocupacion: 'clasificacion.correlativa_ocupacion',
  conocimiento: 'clasificacion.correlativa_conocimiento',
};

const ETIQUETA_TIPO: Record<TipoCarga, string> = {
  denominacion: 'Denominación',
  ocupacion: 'Ocupación',
  conocimiento: 'Conocimiento',
};

@Injectable()
export class CorrelativaCargaService {
  private readonly logger = new Logger(CorrelativaCargaService.name);

  constructor(private readonly dataSource: DataSource) {}

  // ── Reconocimiento de encabezados ──────────────────────────────────────────

  /**
   * Busca, en todas las hojas y en sus primeras 15 filas, la fila que más
   * encabezados esperados del tipo contenga. Con eso sirve tanto la hoja
   * oficial (encabezados en la fila 7, tras un bloque de título) como un
   * export plano con encabezados en la fila 1.
   */
  validarEncabezados(workbook: XLSX.WorkBook, tipo: TipoCarga): ValidacionEncabezados {
    const columnas = COLUMNAS[tipo];
    let mejor: ValidacionEncabezados | null = null;

    for (const hoja of this.hojasEnOrden(workbook, tipo)) {
      const filas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[hoja], { header: 1, defval: null });
      const tope = Math.min(filas.length, 15);

      for (let i = 0; i < tope; i++) {
        const fila = filas[i];
        if (!Array.isArray(fila)) continue;

        // Encabezado de una fila (export plano) o compuesto con los grupos de
        // arriba (hoja oficial, donde la fila final solo dice «Código |
        // Nombre»). Se queda el que reconozca más columnas.
        const simple = this.mapearFila(fila, columnas);
        const compuesto = i > 0 ? this.mapearFila(this.encabezadoCompuesto(filas, i), columnas) : {};
        const agrupado = Object.keys(compuesto).length > Object.keys(simple).length;
        const mapeo = agrupado ? compuesto : simple;
        const reconocidas = Object.keys(mapeo).length;
        if (reconocidas === 0) continue;

        const faltantes = columnas.filter((c) => c.requerida && !(c.clave in mapeo)).map((c) => c.etiqueta);
        const candidata: ValidacionEncabezados = {
          ok: faltantes.length === 0,
          hoja,
          filaEncabezados: i + 1,
          mapeo,
          faltantes,
          encabezadoAgrupado: agrupado,
          pareceTipo: null,
          totalFilas: this.contarFilasConDatos(filas.slice(i + 1)),
        };

        const mejorActual = mejor ? Object.keys(mejor.mapeo).length : -1;
        if (reconocidas > mejorActual) mejor = candidata;
        if (candidata.ok) break;
      }
      if (mejor?.ok) break;
    }

    if (!mejor) {
      return {
        ok: false,
        hoja: workbook.SheetNames[0] ?? '',
        filaEncabezados: 0,
        mapeo: {},
        faltantes: columnas.filter((c) => c.requerida).map((c) => c.etiqueta),
        pareceTipo: this.adivinarTipo(workbook, tipo),
        totalFilas: 0,
      };
    }

    if (!mejor.ok) mejor.pareceTipo = this.adivinarTipo(workbook, tipo);
    return mejor;
  }

  /** Encabezado normalizado → clave de columna, para una fila candidata. */
  private mapearFila(fila: unknown[], columnas: ColumnaEsperada[]): Record<string, number> {
    const mapeo: Record<string, number> = {};
    fila.forEach((celda, indice) => {
      const encabezado = normalizar(celda);
      if (!encabezado) return;
      for (const columna of columnas) {
        if (columna.clave in mapeo) continue;
        if (columna.alias.includes(encabezado)) {
          mapeo[columna.clave] = indice;
          return;
        }
      }
    });
    return mapeo;
  }

  /**
   * Encabezado de la fila `i` precedido por sus filas de grupo. En las filas de
   * grupo cada rótulo cubre las columnas vacías a su derecha (celdas
   * combinadas), así que se arrastra: «C.N.O, -, C.U.O.C, -» se lee como
   * «cno, cno, cuoc, cuoc».
   */
  private encabezadoCompuesto(filas: unknown[][], i: number): string[] {
    const fila = filas[i] ?? [];
    const grupos: string[][] = [];
    for (let g = Math.max(0, i - FILAS_GRUPO_ENCABEZADO); g < i; g++) {
      const arriba = Array.isArray(filas[g]) ? filas[g] : [];
      let actual = '';
      grupos.push(
        fila.map((_, col) => {
          const valor = normalizar(arriba[col]);
          if (valor) actual = valor;
          return actual;
        }),
      );
    }
    return fila.map((celda, col) =>
      [...grupos.map((g) => g[col]), normalizar(celda)].filter(Boolean).join(' '),
    );
  }

  /**
   * Primero las hojas cuyo nombre corresponde al tipo: el libro oficial trae
   * «Por ocupacion» y «Por denominación», y la segunda también tiene códigos de
   * ocupación CNO y CUOC, así que por encabezados podría pasar por la primera.
   */
  private hojasEnOrden(workbook: XLSX.WorkBook, tipo: TipoCarga): string[] {
    const esDelTipo = (hoja: string) => {
      const nombre = normalizar(hoja);
      return tipo === 'ocupacion'
        ? nombre.includes('ocupacion') && !nombre.includes('denominacion')
        : nombre.includes(tipo);
    };
    return [...workbook.SheetNames].sort((a, b) => Number(esDelTipo(b)) - Number(esDelTipo(a)));
  }

  private contarFilasConDatos(filas: unknown[][]): number {
    return filas.filter((f) => Array.isArray(f) && f.some((v) => v !== null && String(v).trim() !== '')).length;
  }

  /** Si el archivo cumple los obligatorios de OTRO tipo, se le dice al usuario cuál. */
  private adivinarTipo(workbook: XLSX.WorkBook, excluir: TipoCarga): TipoCarga | null {
    for (const otro of TIPOS_CARGA) {
      if (otro === excluir) continue;
      const columnas = COLUMNAS[otro];
      for (const hoja of workbook.SheetNames) {
        const filas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[hoja], { header: 1, defval: null });
        for (let i = 0; i < Math.min(filas.length, 15); i++) {
          if (!Array.isArray(filas[i])) continue;
          const mapeo = this.mapearFila(filas[i], columnas);
          if (columnas.filter((c) => c.requerida).every((c) => c.clave in mapeo)) return otro;
        }
      }
    }
    return null;
  }

  private mensajeArchivoIncorrecto(tipo: TipoCarga, v: ValidacionEncabezados): string {
    const partes = [`El archivo no corresponde al tipo de información seleccionado (${ETIQUETA_TIPO[tipo]}).`];
    if (v.faltantes.length) partes.push(`Faltan las columnas: ${v.faltantes.join(', ')}.`);
    if (v.pareceTipo) partes.push(`Parece un archivo de ${ETIQUETA_TIPO[v.pareceTipo]}.`);
    return partes.join(' ');
  }

  // ── Carga ──────────────────────────────────────────────────────────────────

  async cargar(buffer: Buffer, tipo: TipoCarga): Promise<ResultadoCarga> {
    if (!TIPOS_CARGA.includes(tipo)) {
      throw new BadRequestException(`Tipo de carga no reconocido: ${tipo}.`);
    }

    const inicio = Date.now();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const validacion = this.validarEncabezados(workbook, tipo);
    if (!validacion.ok) {
      throw new BadRequestException(this.mensajeArchivoIncorrecto(tipo, validacion));
    }

    const filas = XLSX.utils
      .sheet_to_json<unknown[]>(workbook.Sheets[validacion.hoja], { header: 1, defval: null })
      .slice(validacion.filaEncabezados);

    const hoja = {
      sheet: validacion.hoja,
      tableName: TABLA[tipo],
      message: '',
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      skippedDetails: [] as string[],
      warnings: [] as string[],
      changes: [] as string[],
    };

    const leer = (fila: unknown[], clave: string): string | null => {
      const indice = validacion.mapeo[clave];
      if (indice === undefined) return null;
      const valor = fila[indice];
      if (valor === null || valor === undefined) return null;
      const texto = String(valor).replace(INVISIBLES, '').trim();
      return texto === '' ? null : texto;
    };
    const desplazamiento = validacion.filaEncabezados + 1; // fila Excel de la primera fila de datos

    let columnasSql: string[];
    let registros: unknown[][];
    let alta: AltaCatalogos | undefined;

    switch (tipo) {
      case 'denominacion':
        ({ columnasSql, registros, alta } = await this.prepararDenominaciones(filas, leer, desplazamiento, hoja));
        break;
      case 'ocupacion':
        ({ columnasSql, registros, alta } = await this.prepararOcupaciones(
          filas,
          leer,
          desplazamiento,
          hoja,
          validacion.encabezadoAgrupado === true,
        ));
        break;
      case 'conocimiento':
        ({ columnasSql, registros, alta } = await this.prepararConocimientos(filas, leer, desplazamiento, hoja));
        break;
    }

    if (registros.length === 0) {
      throw new BadRequestException(
        `Ninguna fila del archivo pasó la validación (${hoja.skipped} omitidas, ${hoja.errors.length} con error). ` +
          'No se modificó la base de datos.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      if (alta) await alta(manager);
      await manager.query(`TRUNCATE TABLE ${TABLA[tipo]} RESTART IDENTITY CASCADE`);
      await this.insertarPorLotes(manager, TABLA[tipo], columnasSql, registros);
    });
    hoja.inserted = registros.length;

    hoja.message =
      `'${hoja.sheet}' (${hoja.tableName}): ${hoja.inserted} insertados, ${hoja.skipped} omitidos, ` +
      `${hoja.errors.length} errores, ${hoja.warnings.length} avisos.`;

    const message =
      hoja.errors.length === 0
        ? `Se importaron ${hoja.inserted} registros de ${ETIQUETA_TIPO[tipo]}.`
        : `Se importaron ${hoja.inserted} registros de ${ETIQUETA_TIPO[tipo]}; ${hoja.skipped} filas se omitieron por errores.`;
    this.logger.log(message);

    return {
      message,
      totalInserted: hoja.inserted,
      totalUpdated: 0,
      totalSkipped: hoja.skipped,
      totalErrors: hoja.errors.length,
      totalWarnings: hoja.warnings.length,
      elapsedMs: Date.now() - inicio,
      sheets: [hoja],
    };
  }

  // ── Preparación por tipo ───────────────────────────────────────────────────
  // Cada una valida contra su catálogo y deduplica pares repetidos. Lo que el
  // catálogo no tiene y se puede registrar (denominación, conocimiento) se
  // devuelve en `alta`; lo que no (una ocupación) omite la fila y se reporta.

  private async prepararDenominaciones(
    filas: unknown[][],
    leer: (f: unknown[], k: string) => string | null,
    desplazamiento: number,
    hoja: ResultadoCarga['sheets'][number],
  ) {
    const [denomCno, denomCuoc, ocupCno, ocupCuoc] = await Promise.all([
      this.codigos('SELECT cod_denominacion_cno AS c FROM clasificacion.cno_denominacion'),
      this.codigos('SELECT cod_denominacion AS c FROM clasificacion.cuoc_denominacion'),
      this.codigos('SELECT cod_ocupacion_cno AS c FROM clasificacion.cno_ocupacion'),
      this.codigos('SELECT cod_ocupacion_cuoc AS c FROM clasificacion.cuoc_ocupacion'),
    ]);
    this.exigirCatalogos([
      { nombre: 'de denominaciones CNO', codigos: denomCno, origen: 'el Excel de CNO' },
      { nombre: 'de denominaciones CUOC', codigos: denomCuoc, origen: 'el Excel de CUOC' },
    ]);

    // Primera pasada: filas legibles y ocupaciones que faltan en el catálogo.
    const lineas = filas.flatMap((fila, i) => {
      if (!Array.isArray(fila)) return [];
      let cuocDenom = leer(fila, 'codDenominacionCuoc');
      let cuocOcup = leer(fila, 'codOcupacionCuoc');
      // Algunos exports traen estas dos columnas CUOC intercambiadas: la de
      // denominación siempre lleva sufijo ".NNN" y la de ocupación nunca lo
      // lleva, así que el formato basta para corregirlo sin depender de cuál
      // encabezado cayó en cuál columna.
      if (cuocDenom && cuocOcup && !cuocDenom.includes('.') && cuocOcup.includes('.')) {
        [cuocDenom, cuocOcup] = [cuocOcup, cuocDenom];
      }
      return [{ fila, nro: i + desplazamiento, cnoOcup: leer(fila, 'codOcupacionCno'), cnoDenom: leer(fila, 'codDenominacionCno'), cuocDenom, cuocOcup }];
    });
    const faltanCno = new Map<string, string | null>();
    const faltanCuoc = new Map<string, string | null>();
    for (const l of lineas) {
      if (l.cnoOcup && !ocupCno.has(l.cnoOcup)) faltanCno.set(l.cnoOcup, null);
      if (l.cuocOcup && !ocupCuoc.has(l.cuocOcup)) faltanCuoc.set(l.cuocOcup, null);
    }
    const plan = await this.planificarOcupaciones(faltanCno, faltanCuoc, ocupCno, ocupCuoc, hoja);

    const vistos = new Set<string>();
    const registros: unknown[][] = [];
    // código → [código, nombre, ocupación]
    const nuevasCno = new Map<string, unknown[]>();
    const nuevasCuoc = new Map<string, unknown[]>();

    for (const { fila, nro, cnoOcup, cnoDenom, cuocDenom, cuocOcup } of lineas) {
      if (!cnoOcup && !cnoDenom && !cuocDenom && !cuocOcup) continue; // fila vacía

      const faltan = [
        !cnoOcup && 'código ocupación CNO',
        !cnoDenom && 'código denominación CNO',
        !cuocDenom && 'código denominación CUOC',
        !cuocOcup && 'código ocupación CUOC',
      ].filter(Boolean);
      if (faltan.length) {
        hoja.skipped++;
        hoja.skippedDetails.push(`[fila ${nro}] Fila incompleta, falta: ${faltan.join(', ')}.`);
        continue;
      }
      // Una denominación nueva se registra colgada de su ocupación, así que esa
      // ocupación tiene que existir o poder registrarse.
      const cnoNueva = !denomCno.has(cnoDenom!);
      const cuocNueva = !denomCuoc.has(cuocDenom!);
      if (cnoNueva && !plan.existe('cno', cnoOcup!)) {
        hoja.skipped++;
        hoja.errors.push(
          `[fila ${nro}] La denominación CNO '${cnoDenom}' no existe y su ocupación CNO '${cnoOcup}' no se pudo registrar ` +
            `(${plan.motivo('cno', cnoOcup!)}); la fila se omitió.`,
        );
        continue;
      }
      if (cuocNueva && !plan.existe('cuoc', cuocOcup!)) {
        hoja.skipped++;
        hoja.errors.push(
          `[fila ${nro}] La denominación CUOC '${cuocDenom}' no existe y su ocupación CUOC '${cuocOcup}' no se pudo registrar ` +
            `(${plan.motivo('cuoc', cuocOcup!)}); la fila se omitió.`,
        );
        continue;
      }
      if (cnoNueva && !nuevasCno.has(cnoDenom!)) {
        nuevasCno.set(cnoDenom!, [cnoDenom, leer(fila, 'descDenominacionCno'), cnoOcup]);
      }
      if (cuocNueva && !nuevasCuoc.has(cuocDenom!)) {
        nuevasCuoc.set(cuocDenom!, [cuocDenom, leer(fila, 'descDenominacionCuoc'), cuocOcup]);
      }
      if (!plan.existe('cno', cnoOcup!)) hoja.warnings.push(`[fila ${nro}] La ocupación CNO '${cnoOcup}' no existe en el catálogo.`);
      if (!plan.existe('cuoc', cuocOcup!)) hoja.warnings.push(`[fila ${nro}] La ocupación CUOC '${cuocOcup}' no existe en el catálogo.`);

      const par = `${cnoDenom}||${cuocDenom}`;
      if (vistos.has(par)) {
        hoja.skipped++;
        hoja.skippedDetails.push(`[fila ${nro}] Par '${cnoDenom}' – '${cuocDenom}' repetido en el archivo, no se duplicó.`);
        continue;
      }
      vistos.add(par);

      registros.push([
        cnoOcup,
        cnoDenom,
        leer(fila, 'descDenominacionCno'),
        cuocDenom,
        leer(fila, 'descDenominacionCuoc'),
        cuocOcup,
        this.booleano(leer(fila, 'estado')),
        leer(fila, 'observacion'),
      ]);
    }

    return {
      columnasSql: [
        'cod_ocupacion_cno',
        'cod_denominacion_cno',
        'desc_denominacion_cno',
        'cod_denominacion_cuoc',
        'desc_denominacion_cuoc',
        'cod_ocupacion_cuoc',
        'estado',
        'observacion',
      ],
      registros,
      alta: async (manager: EntityManager) => {
        // Primero las ocupaciones: las denominaciones nuevas cuelgan de ellas.
        await plan.alta(manager);
        const ahora = new Date();
        if (nuevasCno.size > 0) {
          await this.insertarPorLotes(
            manager,
            'clasificacion.cno_denominacion',
            ['cod_denominacion_cno', 'desc_denominacion', 'cno_cod_ocupacion', 'estado', 'fecha_reg'],
            [...nuevasCno.values()].map(([cod, nombre, ocup]) => [cod, nombre, ocup, 1, ahora]),
          );
          await resincronizarSecuencia(manager, 'cno_denominacion', 'codigo');
          hoja.changes.push(
            `Se registraron en el catálogo CNO ${nuevasCno.size} denominación(es) que traía el archivo: ${listaCodigos([...nuevasCno.keys()])}.`,
          );
        }
        if (nuevasCuoc.size > 0) {
          await this.insertarPorLotes(
            manager,
            'clasificacion.cuoc_denominacion',
            ['cod_denominacion', 'nom_denominacion', 'cod_ocupacion_cuoc', 'fuente_denom', 'estado', 'fecha_registro'],
            [...nuevasCuoc.values()].map(([cod, nombre, ocup]) => [cod, nombre, ocup, 'Correlativa', 1, ahora]),
          );
          await resincronizarSecuencia(manager, 'cuoc_denominacion', 'codigo');
          hoja.changes.push(
            `Se registraron en el catálogo CUOC ${nuevasCuoc.size} denominación(es) que traía el archivo: ${listaCodigos([...nuevasCuoc.keys()])}.`,
          );
        }
      },
    };
  }

  /**
   * @param heredarCno Hoja oficial: una ocupación CNO con varias CUOC solo
   *   escribe su código en la primera fila; las siguientes la heredan.
   */
  private async prepararOcupaciones(
    filas: unknown[][],
    leer: (f: unknown[], k: string) => string | null,
    desplazamiento: number,
    hoja: ResultadoCarga['sheets'][number],
    heredarCno = false,
  ) {
    const [ocupCno, ocupCuoc] = await Promise.all([
      this.codigos('SELECT cod_ocupacion_cno AS c FROM clasificacion.cno_ocupacion'),
      this.codigos('SELECT cod_ocupacion_cuoc AS c FROM clasificacion.cuoc_ocupacion'),
    ]);
    this.exigirCatalogos([
      { nombre: 'de ocupaciones CNO', codigos: ocupCno, origen: 'el Excel de CNO' },
      { nombre: 'de ocupaciones CUOC', codigos: ocupCuoc, origen: 'el Excel de CUOC' },
    ]);

    // Primera pasada: filas (con el CNO heredado) y ocupaciones que faltan.
    let cnoAnterior: string | null = null;
    let nombreCnoAnterior: string | null = null;
    const lineas = filas.flatMap((fila, i) => {
      if (!Array.isArray(fila)) return [];
      let cno = leer(fila, 'codOcupacionCno');
      let nombreCno = leer(fila, 'nombOcupacionCno');
      const cuoc = leer(fila, 'codOcupacionCuoc');
      if (!cno && !cuoc) return [];
      if (heredarCno) {
        if (cno) {
          cnoAnterior = cno;
          nombreCnoAnterior = nombreCno;
        } else {
          cno = cnoAnterior;
          nombreCno = nombreCno ?? nombreCnoAnterior;
        }
      }
      return [{ fila, nro: i + desplazamiento, cno, nombreCno, cuoc, nombreCuoc: leer(fila, 'nombOcupacionCuoc') }];
    });
    const faltanCno = new Map<string, string | null>();
    const faltanCuoc = new Map<string, string | null>();
    // Nombre de cada ocupación según el archivo (para completar las registradas sin nombre).
    const nombresCno = new Map<string, string>();
    const nombresCuoc = new Map<string, string>();
    for (const l of lineas) {
      if (l.cno && l.nombreCno) nombresCno.set(l.cno, l.nombreCno);
      if (l.cuoc && l.nombreCuoc) nombresCuoc.set(l.cuoc, l.nombreCuoc);
      if (l.cno && !ocupCno.has(l.cno)) faltanCno.set(l.cno, l.nombreCno ?? faltanCno.get(l.cno) ?? null);
      if (l.cuoc && !ocupCuoc.has(l.cuoc)) faltanCuoc.set(l.cuoc, l.nombreCuoc ?? faltanCuoc.get(l.cuoc) ?? null);
    }
    const plan = await this.planificarOcupaciones(faltanCno, faltanCuoc, ocupCno, ocupCuoc, hoja);

    const vistos = new Set<string>();
    const registros: unknown[][] = [];

    for (const { fila, nro, cno, nombreCno, cuoc, nombreCuoc } of lineas) {
      if (!cno || !cuoc) {
        hoja.skipped++;
        hoja.skippedDetails.push(`[fila ${nro}] Fila incompleta, falta el código de ocupación ${!cno ? 'CNO' : 'CUOC'}.`);
        continue;
      }
      if (!plan.existe('cno', cno)) {
        hoja.skipped++;
        hoja.errors.push(`[fila ${nro}] La ocupación CNO '${cno}' no existe y no se pudo registrar (${plan.motivo('cno', cno)}); la fila se omitió.`);
        continue;
      }
      if (!plan.existe('cuoc', cuoc)) {
        hoja.skipped++;
        hoja.errors.push(`[fila ${nro}] La ocupación CUOC '${cuoc}' no existe y no se pudo registrar (${plan.motivo('cuoc', cuoc)}); la fila se omitió.`);
        continue;
      }
      const par = `${cno}||${cuoc}`;
      if (vistos.has(par)) {
        hoja.skipped++;
        hoja.skippedDetails.push(`[fila ${nro}] Par '${cno}' – '${cuoc}' repetido en el archivo, no se duplicó.`);
        continue;
      }
      vistos.add(par);
      registros.push([cno, nombreCno, cuoc, nombreCuoc, leer(fila, 'observacion')]);
    }

    return {
      columnasSql: ['cno_ocupacion_cno', 'nomb_ocupacion_cno', 'cuoc_ocupacion_cuoc', 'nomb_ocupacion_cuoc', 'observacion'],
      registros,
      alta: async (manager: EntityManager) => {
        await plan.alta(manager);
        // Una ocupación registrada desde la hoja de denominaciones no traía
        // nombre: esta hoja sí lo trae.
        for (const [tabla, colCod, colNombre, nombres] of [
          ['cno_ocupacion', 'cod_ocupacion_cno', 'nomb_ocupacion_cno', nombresCno],
          ['cuoc_ocupacion', 'cod_ocupacion_cuoc', 'nom_ocupacion_cuoc', nombresCuoc],
        ] as const) {
          if (nombres.size === 0) continue;
          await manager.query(
            `UPDATE clasificacion.${tabla} t SET ${colNombre} = v.nombre
               FROM unnest($1::text[], $2::text[]) AS v(cod, nombre)
              WHERE t.${colCod} = v.cod AND t.${colNombre} IS NULL AND t.trazabilidad = $3`,
            [[...nombres.keys()], [...nombres.values()], TRAZA_CORRELATIVA],
          );
        }
      },
    };
  }

  /**
   * Ocupaciones que el archivo trae y el catálogo no tiene. La correlativa no
   * trae los campos obligatorios de una ocupación, así que se deducen del
   * propio catálogo:
   *  - CUOC: grupo primario = los 4 primeros dígitos del código (26590 → 2659);
   *    nivel y área, los de otra ocupación de ese grupo primario.
   *  - CNO: área de desempeño y nivel de la ocupación más cercana por código
   *    (mismos 3, 2 o 1 primeros dígitos).
   * Quedan marcadas en `trazabilidad`. Lo que no se puede deducir se informa
   * y esas filas se omiten.
   */
  private async planificarOcupaciones(
    faltanCno: Map<string, string | null>,
    faltanCuoc: Map<string, string | null>,
    ocupCno: Set<string>,
    ocupCuoc: Set<string>,
    hoja: ResultadoCarga['sheets'][number],
  ): Promise<PlanOcupaciones> {
    const crearCno = new Map<string, unknown[]>();
    const crearCuoc = new Map<string, unknown[]>();
    const motivos = new Map<string, string>();
    const hoy = new Date();

    for (const [cod, nombre] of faltanCuoc) {
      const grupo = cod.slice(0, 4);
      const [hermana] = /^\d{5}$/.test(cod)
        ? await this.dataSource.query(
            `SELECT cod_nivel_cuoc, nombre_nivel, codigo_area_cuoc, nombre
               FROM clasificacion.cuoc_ocupacion
              WHERE cod_grupo_prim = $1 AND cod_ocupacion_cuoc ~ '^[0-9]{5}$'
              ORDER BY cod_ocupacion_cuoc DESC
              LIMIT 1`,
            [grupo],
          )
        : [];
      if (!hermana) {
        motivos.set(`cuoc:${cod}`, `no hay ninguna ocupación del grupo primario ${grupo} de la cual tomar su nivel y área`);
        continue;
      }
      crearCuoc.set(cod, [
        cod, nombre, true, grupo, hermana.cod_nivel_cuoc, hermana.nombre_nivel,
        hermana.codigo_area_cuoc, hermana.nombre, hoy, TRAZA_CORRELATIVA,
      ]);
    }

    for (const [cod, nombre] of faltanCno) {
      let cercana: Record<string, unknown> | undefined;
      for (const largo of [3, 2, 1]) {
        [cercana] = await this.dataSource.query(
          `SELECT cod_desempeno_cno, nom_desempeno, cod_cualificacion_cno, niveles_cualificacion
             FROM clasificacion.cno_ocupacion
            WHERE cod_ocupacion_cno LIKE $1 || '%' AND cod_ocupacion_cno ~ '^[0-9]{4}$'
            ORDER BY cod_ocupacion_cno
            LIMIT 1`,
          [cod.slice(0, largo)],
        );
        if (cercana) break;
      }
      if (!/^\d{4}$/.test(cod) || !cercana) {
        motivos.set(`cno:${cod}`, 'no hay ninguna ocupación CNO cercana de la cual tomar su área y nivel');
        continue;
      }
      crearCno.set(cod, [
        cod, nombre, true, cercana.cod_desempeno_cno, cercana.nom_desempeno,
        cercana.cod_cualificacion_cno, cercana.niveles_cualificacion, hoy, TRAZA_CORRELATIVA,
      ]);
    }

    return {
      existe: (tipo, codigo) =>
        tipo === 'cno' ? ocupCno.has(codigo) || crearCno.has(codigo) : ocupCuoc.has(codigo) || crearCuoc.has(codigo),
      motivo: (tipo, codigo) => motivos.get(`${tipo}:${codigo}`) ?? 'no existe en el catálogo',
      alta: async (manager: EntityManager) => {
        if (crearCuoc.size > 0) {
          await this.insertarPorLotes(
            manager,
            'clasificacion.cuoc_ocupacion',
            [
              'cod_ocupacion_cuoc', 'nom_ocupacion_cuoc', 'estado', 'cod_grupo_prim', 'cod_nivel_cuoc',
              'nombre_nivel', 'codigo_area_cuoc', 'nombre', 'fecha_registro', 'trazabilidad',
            ],
            [...crearCuoc.values()],
          );
          hoja.changes.push(
            `Se registraron en el catálogo CUOC ${crearCuoc.size} ocupación(es) que traía el archivo: ${listaCodigos([...crearCuoc.keys()])} ` +
              '(grupo primario según su código; nivel y área de otra ocupación de ese grupo).',
          );
        }
        if (crearCno.size > 0) {
          await this.insertarPorLotes(
            manager,
            'clasificacion.cno_ocupacion',
            [
              'cod_ocupacion_cno', 'nomb_ocupacion_cno', 'estado', 'cod_desempeno_cno', 'nom_desempeno',
              'cod_cualificacion_cno', 'niveles_cualificacion', 'fecha_registro', 'trazabilidad',
            ],
            [...crearCno.values()],
          );
          hoja.changes.push(
            `Se registraron en el catálogo CNO ${crearCno.size} ocupación(es) que traía el archivo: ${listaCodigos([...crearCno.keys()])} ` +
              '(área y nivel de la ocupación más cercana por código).',
          );
        }
      },
    };
  }

  private async prepararConocimientos(
    filas: unknown[][],
    leer: (f: unknown[], k: string) => string | null,
    desplazamiento: number,
    hoja: ResultadoCarga['sheets'][number],
  ) {
    const [conocCno, conocCuoc] = await Promise.all([
      this.codigos('SELECT cod_conocimiento AS c FROM clasificacion.cno_conocimiento'),
      this.codigos('SELECT cod_conocimiento AS c FROM clasificacion.cuoc_conocimiento'),
    ]);
    this.exigirCatalogos([
      { nombre: 'de conocimientos CNO', codigos: conocCno, origen: 'el Excel de CNO' },
      { nombre: 'de conocimientos CUOC', codigos: conocCuoc, origen: 'el Excel de CUOC' },
    ]);
    const vistos = new Set<string>();
    const registros: unknown[][] = [];
    // código → nombre
    const nuevosCno = new Map<number, string>();
    const nuevosCuoc = new Map<number, string>();
    const soloCno: string[] = [];
    const soloCuoc: string[] = [];

    filas.forEach((fila, i) => {
      if (!Array.isArray(fila)) return;
      const nro = i + desplazamiento;
      const cnoTxt = leer(fila, 'codConocimientoCno');
      const cuocTxt = leer(fila, 'codConocimientoCuoc');
      if (!cnoTxt && !cuocTxt) return;

      const cno = this.entero(cnoTxt);
      const cuoc = this.entero(cuocTxt);
      // Conocimiento que solo existe en un catálogo: no forma un par, así que la
      // correlativa no lo guarda. No es un error ni algo que corregir.
      if (cno !== null && !cuocTxt) {
        soloCno.push(String(cno));
        return;
      }
      if (cuoc !== null && !cnoTxt) {
        soloCuoc.push(String(cuoc));
        return;
      }
      if (cno === null || cuoc === null) {
        hoja.skipped++;
        hoja.skippedDetails.push(`[fila ${nro}] Código de conocimiento CNO y/o CUOC no numérico.`);
        return;
      }
      // Un conocimiento nuevo se registra con el nombre que trae el archivo; sin
      // nombre no hay qué registrar.
      const nombreCno = leer(fila, 'nombConocimientoCno');
      const nombreCuoc = leer(fila, 'nombConocimientoCuoc');
      if (!conocCno.has(String(cno)) && !nuevosCno.has(cno) && !nombreCno) {
        hoja.skipped++;
        hoja.errors.push(`[fila ${nro}] El conocimiento CNO '${cno}' no existe y el archivo no trae su nombre; la fila se omitió.`);
        return;
      }
      if (!conocCuoc.has(String(cuoc)) && !nuevosCuoc.has(cuoc) && !nombreCuoc) {
        hoja.skipped++;
        hoja.errors.push(`[fila ${nro}] El conocimiento CUOC '${cuoc}' no existe y el archivo no trae su nombre; la fila se omitió.`);
        return;
      }
      if (!conocCno.has(String(cno)) && !nuevosCno.has(cno)) nuevosCno.set(cno, nombreCno!);
      if (!conocCuoc.has(String(cuoc)) && !nuevosCuoc.has(cuoc)) nuevosCuoc.set(cuoc, nombreCuoc!);
      const par = `${cno}||${cuoc}`;
      if (vistos.has(par)) {
        hoja.skipped++;
        hoja.skippedDetails.push(`[fila ${nro}] Par ${cno} – ${cuoc} repetido en el archivo, no se duplicó.`);
        return;
      }
      vistos.add(par);
      registros.push([
        cno,
        leer(fila, 'nombConocimientoCno'),
        cuoc,
        leer(fila, 'nombConocimientoCuoc'),
        this.aplica(leer(fila, 'aplica')),
      ]);
    });

    if (soloCno.length + soloCuoc.length > 0) {
      const partes = [
        soloCno.length ? `${soloCno.length} solo en CNO (${listaCodigos(soloCno)})` : '',
        soloCuoc.length ? `${soloCuoc.length} solo en CUOC (${listaCodigos(soloCuoc)})` : '',
      ].filter(Boolean);
      hoja.changes.push(
        `${soloCno.length + soloCuoc.length} conocimientos del archivo no tienen equivalente en el otro catálogo: ` +
          `${partes.join(' y ')}. La correlativa solo guarda pares CNO–CUOC, por eso no se incluyen; ` +
          'siguen disponibles en su propio catálogo. No requiere ninguna acción.',
      );
    }

    return {
      columnasSql: ['cod_conocimiento_cno', 'nomb_conocimiento_cno', 'cod_conocimiento_cuoc', 'nomb_conocimiento_cuoc', 'aplica_correl_conocimientos'],
      registros,
      alta: async (manager: EntityManager) => {
        if (nuevosCno.size > 0) {
          await this.insertarPorLotes(
            manager,
            'clasificacion.cno_conocimiento',
            ['cod_conocimiento', 'nomb_conocimiento'],
            [...nuevosCno].map(([cod, nombre]) => [cod, nombre]),
          );
          await resincronizarSecuencia(manager, 'cno_conocimiento', 'cod_conocimiento');
          hoja.changes.push(
            `Se registraron en el catálogo CNO ${nuevosCno.size} conocimiento(s) que traía el archivo: ${listaCodigos([...nuevosCno.keys()].map(String))}.`,
          );
        }
        if (nuevosCuoc.size > 0) {
          await this.insertarPorLotes(
            manager,
            'clasificacion.cuoc_conocimiento',
            ['cod_conocimiento', 'nomb_conocimiento'],
            [...nuevosCuoc].map(([cod, nombre]) => [cod, nombre]),
          );
          hoja.changes.push(
            `Se registraron en el catálogo CUOC ${nuevosCuoc.size} conocimiento(s) que traía el archivo: ${listaCodigos([...nuevosCuoc.keys()].map(String))}.`,
          );
        }
      },
    };
  }

  // ── Utilidades ─────────────────────────────────────────────────────────────

  private async codigos(sql: string): Promise<Set<string>> {
    const filas: Array<{ c: unknown }> = await this.dataSource.query(sql);
    return new Set(filas.map((r) => String(r.c)));
  }

  /**
   * Un catálogo vacío hace fallar la validación de TODAS las filas, y el error
   * final ("ninguna fila pasó la validación") no dice por qué. Se corta antes
   * con el motivo real: falta cargar el Excel de CNO o de CUOC.
   */
  private exigirCatalogos(catalogos: Array<{ nombre: string; codigos: Set<string>; origen: string }>): void {
    const vacios = catalogos.filter((c) => c.codigos.size === 0);
    if (vacios.length === 0) return;

    const unico = vacios.length === 1;
    const origenes = [...new Set(vacios.map((c) => c.origen))];
    throw new BadRequestException(
      `No se puede cargar la correlativa: ${unico ? 'el catálogo' : 'los catálogos'} ` +
        `${vacios.map((c) => c.nombre).join(' y ')} ${unico ? 'está vacío' : 'están vacíos'}. ` +
        `Carga primero ${origenes.join(' y ')} desde Actualización y vuelve a intentarlo.`,
    );
  }

  private entero(texto: string | null): number | null {
    if (texto === null) return null;
    const n = parseInt(texto, 10);
    return Number.isNaN(n) ? null : n;
  }

  /** «sí», «true», «1», «activo» → true; «no», «false», «0», «inactivo» → false; otro → null. */
  private booleano(texto: string | null): boolean | null {
    if (texto === null) return null;
    const v = normalizar(texto);
    if (['si', 's', 'true', '1', 'activo', 'x', 'verdadero'].includes(v)) return true;
    if (['no', 'n', 'false', '0', 'inactivo', 'falso'].includes(v)) return false;
    return null;
  }

  /** `aplica` es SMALLINT: acepta 1/0 o sí/no; vacío → 0, como hacía el cargue histórico. */
  private aplica(texto: string | null): number {
    const b = this.booleano(texto);
    if (b !== null) return b ? 1 : 0;
    return this.entero(texto) ?? 0;
  }

  private async insertarPorLotes(manager: any, tabla: string, columnas: string[], filas: unknown[][]): Promise<void> {
    const lote = 300;
    for (let i = 0; i < filas.length; i += lote) {
      const trozo = filas.slice(i, i + lote);
      const marcadores = trozo
        .map((_, r) => `(${columnas.map((_, c) => `$${r * columnas.length + c + 1}`).join(', ')})`)
        .join(', ');
      await manager.query(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES ${marcadores}`, trozo.flat());
    }
  }

  // ── Listado de ocupaciones ─────────────────────────────────────────────────

  /**
   * Filas de la correlativa de ocupación. Con `cno` o `cuoc` devuelve solo las
   * de esa ocupación, que es como la consulta la ficha de una ocupación: pedir
   * la tabla entera para filtrar en el navegador no escala.
   */
  async listarOcupaciones(filtro?: { cno?: string; cuoc?: string }): Promise<
    Array<{
      codigo: number;
      codOcupacionCno: string;
      nombOcupacionCno: string | null;
      codOcupacionCuoc: string;
      nombOcupacionCuoc: string | null;
      descOcupacionCno: string | null;
      descOcupacionCuoc: string | null;
      observacion: string | null;
    }>
  > {
    const condiciones: string[] = [];
    const parametros: string[] = [];

    const cno = filtro?.cno?.trim();
    if (cno) {
      parametros.push(cno);
      condiciones.push(`co.cno_ocupacion_cno = $${parametros.length}`);
    }

    const cuoc = filtro?.cuoc?.trim();
    if (cuoc) {
      parametros.push(cuoc);
      condiciones.push(`co.cuoc_ocupacion_cuoc = $${parametros.length}`);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    // La descripción no se guarda en la correlativa: se toma de cada catálogo,
    // así siempre es la vigente. LEFT JOIN para no perder filas cuya ocupación
    // ya no exista en el catálogo.
    return this.dataSource.query(
      `SELECT
         co.codigo              AS "codigo",
         co.cno_ocupacion_cno   AS "codOcupacionCno",
         co.nomb_ocupacion_cno  AS "nombOcupacionCno",
         co.cuoc_ocupacion_cuoc AS "codOcupacionCuoc",
         co.nomb_ocupacion_cuoc AS "nombOcupacionCuoc",
         cno.descripcion          AS "descOcupacionCno",
         cuoc.desc_ocupacion_cuoc AS "descOcupacionCuoc",
         co.observacion           AS "observacion"
       FROM clasificacion.correlativa_ocupacion co
       LEFT JOIN clasificacion.cno_ocupacion cno ON cno.cod_ocupacion_cno = co.cno_ocupacion_cno
       LEFT JOIN clasificacion.cuoc_ocupacion cuoc ON cuoc.cod_ocupacion_cuoc = co.cuoc_ocupacion_cuoc
       ${where}
       ORDER BY co.codigo ASC`,
      parametros,
    );
  }

  /**
   * Guarda la correlativa de UNA ocupación CNO: deja en la tabla exactamente
   * las CUOC recibidas y borra las que tuviera antes.
   *
   * Crear y editar son la misma operación a propósito: la ocupación CNO es la
   * que identifica la relación, así que volver a guardarla la reemplaza en vez
   * de dejar dos juegos de filas para la misma CNO.
   */
  async guardarOcupaciones(payload: {
    codOcupacionCno: string;
    nombOcupacionCno?: string | null;
    cuoc: Array<{ codigo: string; nombre?: string | null }>;
    observacion?: string | null;
  }): Promise<{ codOcupacionCno: string; total: number }> {
    const codCno = (payload.codOcupacionCno ?? '').trim();
    if (!codCno) {
      throw new BadRequestException('Falta el código de la ocupación CNO.');
    }

    // Un mismo código repetido en la selección produciría filas duplicadas.
    const porCodigo = new Map<string, string | null>();
    for (const item of payload.cuoc ?? []) {
      const codigo = (item?.codigo ?? '').trim();
      if (codigo) porCodigo.set(codigo, item?.nombre?.trim() || null);
    }

    if (porCodigo.size === 0) {
      throw new BadRequestException('La correlativa necesita al menos una ocupación CUOC.');
    }

    const existeCno = await this.codigos(
      'SELECT cod_ocupacion_cno AS c FROM clasificacion.cno_ocupacion',
    );
    if (!existeCno.has(codCno)) {
      throw new BadRequestException(`La ocupación CNO '${codCno}' no existe en el catálogo.`);
    }

    const existeCuoc = await this.codigos(
      'SELECT cod_ocupacion_cuoc AS c FROM clasificacion.cuoc_ocupacion',
    );
    const faltantes = [...porCodigo.keys()].filter((codigo) => !existeCuoc.has(codigo));
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Estas ocupaciones CUOC no existen en el catálogo: ${faltantes.join(', ')}.`,
      );
    }

    const nombreCno = payload.nombOcupacionCno?.trim() || null;
    const observacion = payload.observacion?.trim() || null;
    const filas = [...porCodigo].map(([codigo, nombre]) => [
      codCno,
      nombreCno,
      codigo,
      nombre,
      observacion,
    ]);

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM ${TABLA.ocupacion} WHERE cno_ocupacion_cno = $1`,
        [codCno],
      );
      await this.insertarPorLotes(
        manager,
        TABLA.ocupacion,
        ['cno_ocupacion_cno', 'nomb_ocupacion_cno', 'cuoc_ocupacion_cuoc', 'nomb_ocupacion_cuoc', 'observacion'],
        filas,
      );
    });

    this.logger.log(`[Correlativa] CNO ${codCno}: ${filas.length} CUOC guardadas.`);
    return { codOcupacionCno: codCno, total: filas.length };
  }
}
