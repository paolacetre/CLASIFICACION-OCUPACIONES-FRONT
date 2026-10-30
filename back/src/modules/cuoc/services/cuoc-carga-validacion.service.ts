import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';

import { avisoNombreDeHoja, hojaQueLeeElCargue } from '../../../common/utils/excel-archivo.util';

import {
  ColumnaCargaCuoc,
  DEFINICIONES_CUOC,
  TipoCargaCuoc,
  TIPOS_CARGA_CUOC,
  normalizarEncabezado,
} from '../config/cuoc-carga.config';

export interface ColumnaValidada {
  /** Clave del campo del sistema (para ofrecerlo como destino en «Configurar»). */
  clave: string;
  /** Nombre que ve el usuario. */
  name: string;
  /** Encabezado tal como venía en el archivo, si se encontró. */
  header: string | null;
  found: boolean;
  required: boolean;
}

export interface ErrorFila {
  row: number;
  field: string;
  value: string;
  message: string;
  suggestion: string;
}

/**
 * UNA columna tal como viene en el archivo, exista o no en la estructura del
 * sistema. A diferencia de `ColumnaValidada` (que recorre los campos que el
 * sistema espera), esto recorre las columnas que el archivo trae de verdad —
 * es lo que permite mostrar «10 columnas detectadas · 9 mapeadas · 1 requiere
 * revisión» sin perder de vista la que sobra.
 */
export interface ColumnaDetectada {
  /** Encabezado exacto tal como aparece en el archivo. */
  header: string;
  /** Posición de la columna en la hoja (para leer la vista previa). */
  columnIndex: number;
  mapped: boolean;
  /** Clave del campo del sistema al que se mapeó, si aplica. */
  mappedTo: string | null;
  /** Nombre visible de ese campo, si aplica. */
  mappedLabel: string | null;
}

export interface VistaPreviaCuoc {
  /** Encabezados en el mismo orden que `rows`, uno por cada `ColumnaDetectada`. */
  headers: string[];
  /** Hasta 5 filas de datos, ya como texto, en el mismo orden que `headers`. */
  rows: string[][];
}

export interface ResultadoValidacionCuoc {
  valid: boolean;
  tipo: TipoCargaCuoc;
  /** Hoja del libro donde se encontraron los encabezados. */
  hoja: string | null;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  /** Cuántos campos del sistema (de la definición del tipo) se reconocieron. */
  columnsDetected: number;
  columns: ColumnaValidada[];
  /** Columnas obligatorias que no aparecen en el archivo. */
  missingColumns: string[];
  /** TODAS las columnas del archivo, mapeadas o no. Nunca se descartan. */
  allColumns: ColumnaDetectada[];
  /** Cuántas columnas trae el archivo en total (incluye las que no mapean a nada). */
  totalColumnsDetected: number;
  totalColumnsMapped: number;
  totalColumnsUnmapped: number;
  /** Primeras 5 filas con datos, con TODAS las columnas detectadas. */
  preview: VistaPreviaCuoc;
  errors: ErrorFila[];
  /** Si el archivo parece ser de OTRO tipo, cuál. */
  pareceTipo: TipoCargaCuoc | null;
  /**
   * Por qué el cargue NO leería la hoja donde están los datos (nombre de hoja
   * distinto al que busca). Si viene, la carga queda bloqueada.
   */
  avisoHoja: string | null;
  message: string;
}

const FILAS_VISTA_PREVIA = 5;

/** Cuántos errores de fila se devuelven como máximo (la cuenta total sí es exacta). */
const MAX_ERRORES_DETALLE = 100;
/** Hasta qué fila se busca la de encabezados (los formatos oficiales traen título arriba). */
const MAX_FILAS_ENCABEZADO = 25;

/**
 * Valida un Excel de CUOC contra el tipo que eligió el usuario, SIN escribir
 * nada en base de datos. Es la primera mitad del flujo de carga: el usuario ve
 * el resumen y decide; solo entonces `CuocBulkUploadService` escribe.
 */
@Injectable()
export class CuocCargaValidacionService {
  private readonly logger = new Logger(CuocCargaValidacionService.name);

  /**
   * @param mapeoManual Correcciones explícitas del usuario desde «Configurar»:
   *   encabezado tal como viene en el archivo → clave del campo del sistema.
   *   Gana sobre la detección automática por alias; una clave que no exista
   *   en el tipo, o un encabezado que ya no esté en el archivo, se ignora.
   */
  validar(
    buffer: Buffer,
    tipo: TipoCargaCuoc,
    mapeoManual?: Record<string, string>,
  ): ResultadoValidacionCuoc {
    const definicion = DEFINICIONES_CUOC[tipo];
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const encontrada = this.localizarEncabezados(workbook, definicion.columnas, definicion.hojas);

    if (!encontrada) {
      const faltantes = definicion.columnas.filter((c) => c.requerida).map((c) => c.etiqueta);
      return {
        valid: false,
        tipo,
        hoja: null,
        totalRecords: 0,
        validRecords: 0,
        invalidRecords: 0,
        columnsDetected: 0,
        columns: definicion.columnas.map((c) => ({
          clave: c.clave,
          name: c.etiqueta,
          header: null,
          found: false,
          required: c.requerida,
        })),
        missingColumns: faltantes,
        allColumns: [],
        totalColumnsDetected: 0,
        totalColumnsMapped: 0,
        totalColumnsUnmapped: 0,
        preview: { headers: [], rows: [] },
        errors: [],
        pareceTipo: this.adivinarTipo(workbook, tipo),
        avisoHoja: null,
        message: `No se encontró en el archivo ninguna hoja con las columnas de «${definicion.etiqueta}».`,
      };
    }

    const { hoja, filaEncabezados, mapeo, encabezados, filas } = encontrada;

    this.aplicarMapeoManual(mapeo, encabezados, definicion.columnas, mapeoManual);

    const columns: ColumnaValidada[] = definicion.columnas.map((c) => {
      const indice = mapeo.get(c.clave);
      return {
        clave: c.clave,
        name: c.etiqueta,
        header: indice === undefined ? null : String(encabezados[indice] ?? '').trim() || null,
        found: indice !== undefined,
        required: c.requerida,
      };
    });

    const missingColumns = definicion.columnas
      .filter((c) => c.requerida && !mapeo.has(c.clave))
      .map((c) => c.etiqueta);

    const { errors, totalRecords, invalidRecords } = this.validarFilas(
      filas,
      filaEncabezados,
      definicion.columnas,
      mapeo,
    );

    const allColumns = this.detectarTodasLasColumnas(encabezados, mapeo, definicion.columnas);
    const preview = this.construirVistaPrevia(filas, filaEncabezados, allColumns);
    const totalColumnsMapped = allColumns.filter((c) => c.mapped).length;

    const avisoHoja = avisoNombreDeHoja(workbook.SheetNames, hoja, definicion.hojas, definicion.etiqueta);
    const valid = missingColumns.length === 0 && invalidRecords === 0 && totalRecords > 0 && !avisoHoja;

    return {
      valid,
      tipo,
      hoja,
      totalRecords,
      validRecords: totalRecords - invalidRecords,
      invalidRecords,
      columnsDetected: mapeo.size,
      columns,
      missingColumns,
      allColumns,
      totalColumnsDetected: allColumns.length,
      totalColumnsMapped,
      totalColumnsUnmapped: allColumns.length - totalColumnsMapped,
      preview,
      errors: errors.slice(0, MAX_ERRORES_DETALLE),
      pareceTipo: missingColumns.length > 0 ? this.adivinarTipo(workbook, tipo) : null,
      avisoHoja,
      message: avisoHoja ?? this.componerMensaje(definicion.etiqueta, totalRecords, invalidRecords, missingColumns),
    };
  }

  /** Aplica las correcciones de «Configurar» directamente sobre el mapeo ya detectado. */
  private aplicarMapeoManual(
    mapeo: Map<string, number>,
    encabezados: unknown[],
    columnas: ColumnaCargaCuoc[],
    mapeoManual?: Record<string, string>,
  ): void {
    if (!mapeoManual) return;
    for (const [encabezadoCrudo, clave] of Object.entries(mapeoManual)) {
      if (!columnas.some((c) => c.clave === clave)) continue; // clave ajena a este tipo
      const objetivo = normalizarEncabezado(encabezadoCrudo);
      const indice = encabezados.findIndex(
        (h) => h !== null && h !== undefined && normalizarEncabezado(h) === objetivo,
      );
      if (indice === -1) continue; // esa columna ya no está en el archivo actual
      mapeo.set(clave, indice);
    }
  }

  /**
   * TODAS las columnas con encabezado no vacío, en el orden del archivo, con
   * su estado de mapeo. Es el inventario completo que exige la especificación:
   * ninguna columna del Excel se descarta silenciosamente de este listado,
   * aunque no vaya a cargarse porque no corresponde a ningún campo del sistema.
   */
  private detectarTodasLasColumnas(
    encabezados: unknown[],
    mapeo: Map<string, number>,
    columnas: ColumnaCargaCuoc[],
  ): ColumnaDetectada[] {
    const indiceAClave = new Map<number, string>();
    for (const [clave, indice] of mapeo.entries()) indiceAClave.set(indice, clave);

    const resultado: ColumnaDetectada[] = [];
    encabezados.forEach((valor, indice) => {
      const header = valor === null || valor === undefined ? '' : String(valor).trim();
      if (!header) return;
      const clave = indiceAClave.get(indice) ?? null;
      const columna = clave ? columnas.find((c) => c.clave === clave) : undefined;
      resultado.push({
        header,
        columnIndex: indice,
        mapped: !!columna,
        mappedTo: columna?.clave ?? null,
        mappedLabel: columna?.etiqueta ?? null,
      });
    });
    return resultado;
  }

  /** Primeras filas con datos, con TODAS las columnas detectadas (no solo las mapeadas). */
  private construirVistaPrevia(
    filas: unknown[][],
    filaEncabezados: number,
    allColumns: ColumnaDetectada[],
  ): VistaPreviaCuoc {
    const datos = filas.slice(filaEncabezados + 1).filter((f) => this.filaConDatos(f));
    const rows = datos.slice(0, FILAS_VISTA_PREVIA).map((fila) =>
      allColumns.map((c) => {
        const valor = fila[c.columnIndex];
        return valor === null || valor === undefined ? '' : String(valor).trim();
      }),
    );
    return { headers: allColumns.map((c) => c.header), rows };
  }

  private componerMensaje(
    etiquetaTipo: string,
    total: number,
    invalidos: number,
    faltantes: string[],
  ): string {
    if (faltantes.length > 0) {
      return `Al archivo le faltan columnas obligatorias de «${etiquetaTipo}»: ${faltantes.join(', ')}.`;
    }
    if (total === 0) {
      return 'La hoja se reconoció pero no tiene filas con datos.';
    }
    if (invalidos > 0) {
      return `Se encontraron ${invalidos} registro(s) con inconsistencias de ${total}.`;
    }
    return `El archivo se analizó correctamente: ${total} registro(s) listos para cargar.`;
  }

  /**
   * Busca, en todas las hojas, la fila de encabezados que más columnas del tipo
   * reconoce. Así sirve tanto el formato oficial (con título en las primeras
   * filas) como un export plano con encabezados en la fila 1.
   */
  private localizarEncabezados(
    workbook: XLSX.WorkBook,
    columnas: ColumnaCargaCuoc[],
    hojasCandidatas: string[],
  ): {
    hoja: string;
    filaEncabezados: number;
    mapeo: Map<string, number>;
    encabezados: unknown[];
    filas: unknown[][];
  } | null {
    const requeridas = columnas.filter((c) => c.requerida);
    let mejor: {
      hoja: string;
      filaEncabezados: number;
      mapeo: Map<string, number>;
      encabezados: unknown[];
      filas: unknown[][];
    } | null = null;

    // Primero la hoja que leerá el cargue. Recorrer el libro en orden dejaba
    // ganar a la primera hoja con columnas parecidas: en el export por tablas,
    // «Habilidades» caía en `cuoc_ocupaciones` (tiene `id` y `nombre`) en vez de
    // `cuoc_reg_destrezas`, y `avisoNombreDeHoja` bloqueaba un archivo correcto.
    const hojaDelCargue = hojaQueLeeElCargue(workbook.SheetNames, hojasCandidatas);
    const orden = hojaDelCargue
      ? [hojaDelCargue, ...workbook.SheetNames.filter((h) => h !== hojaDelCargue)]
      : workbook.SheetNames;

    for (const hoja of orden) {
      const filas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[hoja], {
        header: 1,
        defval: null,
      });

      for (let i = 0; i < Math.min(filas.length, MAX_FILAS_ENCABEZADO); i++) {
        const fila = filas[i];
        if (!Array.isArray(fila)) continue;

        const mapeo = this.mapearEncabezados(fila, columnas);
        if (mapeo.size === 0) continue;

        if (!mejor || mapeo.size > mejor.mapeo.size) {
          mejor = { hoja, filaEncabezados: i, mapeo, encabezados: fila, filas };
        }
        if (requeridas.every((c) => mapeo.has(c.clave))) return mejor;
      }
    }

    if (mejor) return mejor;

    // Ninguna columna del tipo se reconoció por contenido en ninguna hoja: si
    // el archivo trae una hoja con el nombre esperado, se usa esa de todos
    // modos. Sin esto, un archivo con encabezados totalmente distintos a los
    // alias conocidos (p. ej. exportado con nombres propios) no tendría ni
    // fila de encabezados que mostrar, y «Configurar» no tendría sobre qué
    // actuar. Mismo criterio que ya usa el cargador real (`findSheet`) para
    // no depender solo del contenido cuando el nombre de la hoja ya lo dice.
    return this.localizarPorNombreDeHoja(workbook, hojasCandidatas);
  }

  private localizarPorNombreDeHoja(
    workbook: XLSX.WorkBook,
    hojasCandidatas: string[],
  ): {
    hoja: string;
    filaEncabezados: number;
    mapeo: Map<string, number>;
    encabezados: unknown[];
    filas: unknown[][];
  } | null {
    const hoja = this.buscarHojaPorNombre(workbook, hojasCandidatas);
    if (!hoja) return null;

    const filas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[hoja], {
      header: 1,
      defval: null,
    });
    const filaEncabezados = this.mejorFilaGenerica(filas);
    const encabezados = Array.isArray(filas[filaEncabezados]) ? filas[filaEncabezados] : [];

    // mapeo vacío a propósito: ninguna columna coincidió por alias; queda para
    // que `aplicarMapeoManual` la rellene con lo que el usuario configure.
    return { hoja, filaEncabezados, mapeo: new Map<string, number>(), encabezados, filas };
  }

  private buscarHojaPorNombre(workbook: XLSX.WorkBook, candidatas: string[]): string | null {
    for (const nombre of candidatas) {
      if (workbook.Sheets[nombre]) return nombre;
    }
    const normSinEspacios = (s: string) => normalizarEncabezado(s).replace(/ /g, '');
    for (const hoja of workbook.SheetNames) {
      const hn = normSinEspacios(hoja);
      if (candidatas.some((c) => normSinEspacios(c) === hn)) return hoja;
    }
    return null;
  }

  /**
   * Fila con más celdas que coincidan con CUALQUIER alias conocido de
   * CUALQUIER tipo (no solo el elegido) — la misma heurística que usa
   * `CuocBulkUploadService.findHeaderRow` para el cargador real, así ambos
   * coinciden en qué fila es la de encabezados.
   *
   * Si ningún alias aparece por ningún lado (encabezados hechos a medida, sin
   * parecido a los oficiales), se cae a adivinar por forma: la primera fila
   * que llena tantas celdas como la que más — un título suelto en una sola
   * celda queda detrás de la fila que sí ocupa todas las columnas, que suele
   * ser la de encabezados.
   */
  private mejorFilaGenerica(filas: unknown[][]): number {
    const aliasConocidos = new Set(
      Object.values(DEFINICIONES_CUOC).flatMap((d) => d.columnas.flatMap((c) => c.alias)),
    );

    let mejorFilaPorAlias = -1;
    let mejorPuntajeAlias = 0;
    let mejorFilaPorRelleno = 0;
    let mejorPuntajeRelleno = -1;

    for (let i = 0; i < Math.min(filas.length, MAX_FILAS_ENCABEZADO); i++) {
      const fila = filas[i];
      if (!Array.isArray(fila)) continue;

      let puntajeAlias = 0;
      let noVacias = 0;
      for (const celda of fila) {
        if (celda == null || String(celda).trim() === '') continue;
        noVacias++;
        if (aliasConocidos.has(normalizarEncabezado(celda))) puntajeAlias++;
      }

      if (puntajeAlias > mejorPuntajeAlias) {
        mejorPuntajeAlias = puntajeAlias;
        mejorFilaPorAlias = i;
      }
      if (noVacias > mejorPuntajeRelleno) {
        mejorPuntajeRelleno = noVacias;
        mejorFilaPorRelleno = i;
      }
    }

    return mejorFilaPorAlias >= 0 ? mejorFilaPorAlias : mejorFilaPorRelleno;
  }

  /**
   * Cada campo toma la celda cuyo alias está más arriba en su lista, no la
   * primera de izquierda a derecha: en el export por tablas la hoja de áreas
   * trae `codigo` (id de fila) antes que `cod_area_cualifi_cuoc` (la sigla).
   */
  private mapearEncabezados(fila: unknown[], columnas: ColumnaCargaCuoc[]): Map<string, number> {
    const mapeo = new Map<string, number>();
    const normalizados = fila.map((celda) => normalizarEncabezado(celda));
    const usadas = new Set<number>();
    for (const columna of columnas) {
      let mejorIndice = -1;
      let mejorPrioridad = Infinity;
      normalizados.forEach((encabezado, indice) => {
        if (!encabezado || usadas.has(indice)) return;
        const prioridad = columna.alias.indexOf(encabezado);
        if (prioridad >= 0 && prioridad < mejorPrioridad) {
          mejorPrioridad = prioridad;
          mejorIndice = indice;
        }
      });
      if (mejorIndice >= 0) {
        mapeo.set(columna.clave, mejorIndice);
        usadas.add(mejorIndice);
      }
    }
    return mapeo;
  }

  /** Obligatorios vacíos, valores no numéricos donde deben serlo y claves repetidas. */
  private validarFilas(
    filas: unknown[][],
    filaEncabezados: number,
    columnas: ColumnaCargaCuoc[],
    mapeo: Map<string, number>,
  ): { errors: ErrorFila[]; totalRecords: number; invalidRecords: number } {
    const errors: ErrorFila[] = [];
    const filasConError = new Set<number>();
    const vistos = new Map<string, Map<string, number>>();

    let totalRecords = 0;

    for (let i = filaEncabezados + 1; i < filas.length; i++) {
      const fila = filas[i];
      if (!this.filaConDatos(fila)) continue;

      totalRecords++;
      // Número de fila tal como se ve en Excel (1-indexado).
      const numeroFila = i + 1;

      for (const columna of columnas) {
        const indice = mapeo.get(columna.clave);
        if (indice === undefined) continue;

        const bruto = fila[indice];
        const valor = bruto === null || bruto === undefined ? '' : String(bruto).trim();

        if (columna.requerida && valor === '') {
          errors.push({
            row: numeroFila,
            field: columna.etiqueta,
            value: '',
            message: 'Campo obligatorio vacío.',
            suggestion: `Completa «${columna.etiqueta}» en esta fila o elimínala del archivo.`,
          });
          filasConError.add(numeroFila);
          continue;
        }

        if (valor === '') continue;

        if (columna.numerica && !/^\d+$/.test(valor)) {
          errors.push({
            row: numeroFila,
            field: columna.etiqueta,
            value: valor,
            message: 'El valor debe ser numérico.',
            suggestion: `Revisa «${columna.etiqueta}»: se esperaba un número entero.`,
          });
          filasConError.add(numeroFila);
          continue;
        }

        if (columna.clavePrimaria) {
          const porColumna = vistos.get(columna.clave) ?? new Map<string, number>();
          const filaPrevia = porColumna.get(valor);
          if (filaPrevia !== undefined) {
            errors.push({
              row: numeroFila,
              field: columna.etiqueta,
              value: valor,
              message: `Código duplicado (ya aparece en la fila ${filaPrevia}).`,
              suggestion: 'Deja una sola fila por código en el archivo.',
            });
            filasConError.add(numeroFila);
          } else {
            porColumna.set(valor, numeroFila);
            vistos.set(columna.clave, porColumna);
          }
        }
      }
    }

    return { errors, totalRecords, invalidRecords: filasConError.size };
  }

  private filaConDatos(fila: unknown): fila is unknown[] {
    return (
      Array.isArray(fila) &&
      fila.some((v) => v !== null && v !== undefined && String(v).trim() !== '')
    );
  }

  /** Si el archivo cumple los obligatorios de OTRO tipo, se le dice al usuario cuál. */
  private adivinarTipo(workbook: XLSX.WorkBook, excluir: TipoCargaCuoc): TipoCargaCuoc | null {
    for (const otro of TIPOS_CARGA_CUOC) {
      if (otro === excluir) continue;
      const columnas = DEFINICIONES_CUOC[otro].columnas;
      const requeridas = columnas.filter((c) => c.requerida);

      for (const hoja of workbook.SheetNames) {
        const filas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[hoja], {
          header: 1,
          defval: null,
        });
        for (let i = 0; i < Math.min(filas.length, MAX_FILAS_ENCABEZADO); i++) {
          if (!Array.isArray(filas[i])) continue;
          const mapeo = this.mapearEncabezados(filas[i], columnas);
          if (requeridas.every((c) => mapeo.has(c.clave))) return otro;
        }
      }
    }
    return null;
  }
}
