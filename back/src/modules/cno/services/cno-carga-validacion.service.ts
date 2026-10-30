import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';

import { avisoNombreDeHoja } from '../../../common/utils/excel-archivo.util';

import {
  ColumnaCargaCno,
  DEFINICIONES_CNO,
  TipoCargaCno,
  TIPOS_CARGA_CNO,
  normalizarEncabezado,
} from '../config/cno-carga.config';

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

export interface VistaPreviaCno {
  /** Encabezados en el mismo orden que `rows`, uno por cada `ColumnaDetectada`. */
  headers: string[];
  /** Hasta 5 filas de datos, ya como texto, en el mismo orden que `headers`. */
  rows: string[][];
}

export interface ResultadoValidacionCno {
  valid: boolean;
  tipo: TipoCargaCno;
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
  preview: VistaPreviaCno;
  errors: ErrorFila[];
  /** Si el archivo parece ser de OTRO tipo, cuál. */
  pareceTipo: TipoCargaCno | null;
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
 * Valida un Excel de CNO contra el tipo que eligió el usuario, SIN escribir
 * nada en base de datos. Es la primera mitad del flujo de carga: el usuario ve
 * el resumen y decide; solo entonces `CnoBulkUploadService` escribe. Mismo
 * diseño que `CuocCargaValidacionService`.
 */
@Injectable()
export class CnoCargaValidacionService {
  private readonly logger = new Logger(CnoCargaValidacionService.name);

  /**
   * @param mapeoManual Correcciones explícitas del usuario desde «Configurar»:
   *   encabezado tal como viene en el archivo → clave del campo del sistema.
   *   Gana sobre la detección automática por alias; una clave que no exista
   *   en el tipo, o un encabezado que ya no esté en el archivo, se ignora.
   */
  validar(
    buffer: Buffer,
    tipo: TipoCargaCno,
    mapeoManual?: Record<string, string>,
  ): ResultadoValidacionCno {
    const definicion = DEFINICIONES_CNO[tipo];
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
    columnas: ColumnaCargaCno[],
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
   * su estado de mapeo. Es el inventario completo: ninguna columna del Excel
   * se descarta silenciosamente de este listado, aunque no vaya a cargarse
   * porque no corresponde a ningún campo del sistema.
   */
  private detectarTodasLasColumnas(
    encabezados: unknown[],
    mapeo: Map<string, number>,
    columnas: ColumnaCargaCno[],
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
  ): VistaPreviaCno {
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
    columnas: ColumnaCargaCno[],
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
    // Si el mejor candidato hasta ahora reconoció al menos una columna
    // OBLIGATORIA de este tipo. Una hoja ajena que solo comparte una columna
    // opcional (p. ej. "descripcion", que varios tipos ofrecen) no debe
    // robarle la detección a la hoja correcta cuando esta última no se
    // reconoce por otro motivo (acentos mal codificados en el archivo,
    // encabezados no estándar, etc.) — en ese caso es mejor caer al lookup
    // por nombre de hoja (`localizarPorNombreDeHoja`) que quedarse con un
    // falso positivo de una sola columna irrelevante.
    let mejorTieneRequerida = false;

    for (const hoja of workbook.SheetNames) {
      const filas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[hoja], {
        header: 1,
        defval: null,
      });

      for (let i = 0; i < Math.min(filas.length, MAX_FILAS_ENCABEZADO); i++) {
        const fila = filas[i];
        if (!Array.isArray(fila)) continue;

        const mapeo = this.mapearEncabezados(fila, columnas);
        if (mapeo.size === 0) continue;

        const tieneRequerida = requeridas.length === 0 || requeridas.some((c) => mapeo.has(c.clave));
        const esMejor =
          !mejor ||
          (tieneRequerida && !mejorTieneRequerida) ||
          (tieneRequerida === mejorTieneRequerida && mapeo.size > mejor.mapeo.size);

        if (esMejor) {
          mejor = { hoja, filaEncabezados: i, mapeo, encabezados: fila, filas };
          mejorTieneRequerida = tieneRequerida;
        }
        if (requeridas.every((c) => mapeo.has(c.clave))) return mejor;
      }
    }

    if (mejor && mejorTieneRequerida) return mejor;

    // Ninguna columna OBLIGATORIA del tipo se reconoció por contenido en
    // ninguna hoja (a lo sumo una coincidencia aislada de columna opcional,
    // que se descarta a propósito): si el archivo trae una hoja con el
    // nombre esperado, se usa esa de todos modos, para que «Configurar»
    // tenga sobre qué actuar.
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
   * CUALQUIER tipo (no solo el elegido). Si ningún alias aparece por ningún
   * lado, se cae a adivinar por forma: la primera fila que llena tantas
   * celdas como la que más — un título suelto en una sola celda queda detrás
   * de la fila que sí ocupa todas las columnas, que suele ser la de
   * encabezados.
   */
  private mejorFilaGenerica(filas: unknown[][]): number {
    const aliasConocidos = new Set(
      Object.values(DEFINICIONES_CNO).flatMap((d) => d.columnas.flatMap((c) => c.alias)),
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

  private mapearEncabezados(fila: unknown[], columnas: ColumnaCargaCno[]): Map<string, number> {
    const mapeo = new Map<string, number>();
    fila.forEach((celda, indice) => {
      const encabezado = normalizarEncabezado(celda);
      if (!encabezado) return;
      for (const columna of columnas) {
        if (mapeo.has(columna.clave)) continue;
        if (columna.alias.includes(encabezado)) {
          mapeo.set(columna.clave, indice);
          return;
        }
      }
    });
    return mapeo;
  }

  /** Obligatorios vacíos, valores no numéricos donde deben serlo y claves repetidas. */
  private validarFilas(
    filas: unknown[][],
    filaEncabezados: number,
    columnas: ColumnaCargaCno[],
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
  private adivinarTipo(workbook: XLSX.WorkBook, excluir: TipoCargaCno): TipoCargaCno | null {
    for (const otro of TIPOS_CARGA_CNO) {
      if (otro === excluir) continue;
      const columnas = DEFINICIONES_CNO[otro].columnas;
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
