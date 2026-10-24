import { CORRELATIVE_UPLOAD_TYPES, CorrelativeUploadType } from '../actualizacion-correlativa.model';

/**
 * Revisión del Excel en el navegador antes de subirlo (como el original `correlativo-carga.config.ts`
 * y la versión desplegada): busca la fila de encabezados, comprueba las columnas obligatorias del
 * tipo, cuenta los registros y arma la vista previa. Es la contraparte de `correlativa-carga.service.ts`
 * del backend, que vuelve a validar al recibir el archivo y es quien decide. Los alias son los
 * mismos en los dos lados: si se agrega uno, va en ambos.
 */

/** Columna que espera un tipo de carga: su clave, su título y los nombres con que se reconoce en el Excel. */
export interface UploadColumn {
  key: string;
  /** Clave de traducción del título de la columna (vista previa y mensajes). */
  labelKey: string;
  /** Encabezados aceptados, normalizados (minúsculas, sin tildes ni signos). */
  aliases: string[];
  required: boolean;
}

const col = (key: string, aliases: string[], required = false): UploadColumn => ({
  key,
  labelKey: `actualizacionCorrelativa.column.${key}`,
  aliases,
  required
});

/** Columnas por tipo, las mismas de `COLUMNAS` en el backend (`id` se acepta pero no se carga). */
export const UPLOAD_COLUMNS: Record<CorrelativeUploadType, UploadColumn[]> = {
  denominacion: [
    col('id', ['id', 'id relacion', 'codigo']),
    col('codOcupacionCno', ['codigo ocupacion cno', 'cod ocupacion cno', 'ocupacion cno', 'codigo cno', 'cno ocupacion codigo'], true),
    col('codDenominacionCno', ['codigo denominacion cno', 'cod denominacion cno', 'denominacion cno codigo', 'cno denominacion codigo'], true),
    col('descDenominacionCno', ['desc denominacion cno', 'descripcion denominacion', 'descripcion denominacion cno', 'denominacion cno', 'nombre denominacion cno', 'nombre denominacion', 'cno denominacion nombre']),
    col('codOcupacionCuoc', ['codigo ocupacion cuoc', 'cod ocupacion cuoc', 'ocupacion cuoc', 'codigo cuoc', 'cuoc ocupacion codigo'], true),
    col('codDenominacionCuoc', ['codigo denominacion cuoc', 'cod denominacion cuoc', 'denominacion cuoc codigo', 'cuoc denominacion codigo'], true),
    col('descDenominacionCuoc', ['desc denominacion cuoc', 'descripcion', 'descripcion denominacion cuoc', 'denominacion cuoc', 'nombre denominacion cuoc', 'descripcion cuoc', 'cuoc denominacion nombre']),
    col('estado', ['estado', 'activo']),
    col('observacion', ['observacion', 'observaciones', 'comentario', 'nota'])
  ],
  ocupacion: [
    col('id', ['id', 'codigo']),
    col('codOcupacionCno', ['cno ocupacion cno', 'codigo ocupacion cno', 'cod ocupacion cno', 'ocupacion cno', 'codigo cno', 'cno ocupacion codigo'], true),
    col('nombOcupacionCno', ['nomb ocupacion cno', 'nombre', 'nombre cno', 'nombre ocupacion cno', 'ocupacion', 'denominacion cno', 'nombre ocupacion', 'cno ocupacion nombre']),
    col('codOcupacionCuoc', ['cno ocupacion cuoc', 'cuoc ocupacion cuoc', 'codigo ocupacion cuoc', 'cod ocupacion cuoc', 'ocupacion cuoc', 'codigo cuoc', 'cuoc ocupacion codigo'], true),
    col('nombOcupacionCuoc', ['nomb ocupacion cuoc', 'nombre cuoc', 'nombre ocupacion cuoc', 'denominacion cuoc', 'descripcion cuoc', 'cuoc ocupacion nombre']),
    col('observacion', ['observacion', 'observaciones', 'comentario', 'nota'])
  ],
  conocimiento: [
    col('id', ['id', 'codigo', 'cod conocimiento']),
    col('codConocimientoCno', ['codigo conocimiento cno', 'cod conocimiento cno', 'conocimiento cno', 'codigo cno'], true),
    col('nombConocimientoCno', ['nombre conocimiento cno', 'nomb conocimiento cno', 'conocimiento cno nombre', 'nombre cno']),
    col('codConocimientoCuoc', ['codigo conocimiento cuoc', 'cod conocimiento cuoc', 'conocimiento cuoc', 'codigo cuoc'], true),
    col('nombConocimientoCuoc', ['nombre conocimiento cuoc', 'nomb conocimiento cuoc', 'conocimiento cuoc nombre', 'nombre cuoc']),
    col('aplica', ['aplica correl conocimientos', 'aplicado', 'aplica', 'se aplica'])
  ]
};

/** Minúsculas, sin tildes, sin signos, espacios colapsados. Igual que en el backend. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lo que se sabe del Excel antes de cargarlo: hoja, columnas encontradas y faltantes, filas y vista previa. */
export interface FileAnalysis {
  /** Están todas las columnas obligatorias del tipo. */
  ok: boolean;
  sheet: string;
  /** Columnas reconocidas que se cargarán, en el orden del tipo (sin `id`). */
  columns: UploadColumn[];
  /** Títulos de las columnas obligatorias que faltan. */
  missing: UploadColumn[];
  /** Encabezados del archivo que no corresponden al tipo: no se cargarán. */
  ignored: string[];
  /** Si el archivo cumple las obligatorias de OTRO tipo, cuál. */
  looksLike: CorrelativeUploadType | null;
  totalRows: number;
  /** Primeras filas con datos, por clave de columna. */
  sample: Array<Record<string, string>>;
}

const MAX_HEADER_ROWS = 15;
const SAMPLE_ROWS = 8;

type Rows = unknown[][];

function mapRow(row: unknown[], columns: UploadColumn[]): Map<string, number> {
  const mapping = new Map<string, number>();
  row.forEach((cell, index) => {
    const header = normalizeHeader(cell);
    if (!header) {
      return;
    }
    const column = columns.find((candidate) => !mapping.has(candidate.key) && candidate.aliases.includes(header));
    if (column) {
      mapping.set(column.key, index);
    }
  });
  return mapping;
}

const hasData = (row: unknown): row is unknown[] => Array.isArray(row) && row.some((value) => value !== null && value !== undefined && String(value).trim() !== '');
const hasRequired = (columns: UploadColumn[], mapping: Map<string, number>) => columns.filter((column) => column.required).every((column) => mapping.has(column.key));
const cellText = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

/**
 * Busca en todas las hojas, en sus primeras 15 filas, la fila que más encabezados del tipo contiene
 * (sirve la hoja oficial con título arriba y una exportación con encabezados en la fila 1).
 */
export function analyzeSheets(sheets: Array<{ name: string; rows: Rows }>, type: CorrelativeUploadType): FileAnalysis {
  const columns = UPLOAD_COLUMNS[type];
  let best: { sheet: string; row: number; mapping: Map<string, number>; rows: Rows } | null = null;

  for (const sheet of sheets) {
    for (let index = 0; index < Math.min(sheet.rows.length, MAX_HEADER_ROWS); index++) {
      if (!Array.isArray(sheet.rows[index])) {
        continue;
      }
      const mapping = mapRow(sheet.rows[index], columns);
      if (mapping.size > 0 && (!best || mapping.size > best.mapping.size)) {
        best = { sheet: sheet.name, row: index, mapping, rows: sheet.rows };
      }
      if (best && hasRequired(columns, best.mapping)) {
        break;
      }
    }
    if (best && hasRequired(columns, best.mapping)) {
      break;
    }
  }

  if (!best) {
    return {
      ok: false,
      sheet: sheets[0]?.name ?? '',
      columns: [],
      missing: columns.filter((column) => column.required),
      ignored: [],
      looksLike: guessType(sheets, type),
      totalRows: 0,
      sample: []
    };
  }

  const found = best;
  const missing = columns.filter((column) => column.required && !found.mapping.has(column.key));
  const recognized = columns.filter((column) => column.key !== 'id' && found.mapping.has(column.key));
  const usedIndexes = new Set(found.mapping.values());
  const headerRow = found.rows[found.row] ?? [];
  const ignored = headerRow
    .map((cell, index) => ({ text: cellText(cell), index }))
    .filter((cell) => cell.text && !usedIndexes.has(cell.index))
    .map((cell) => cell.text);
  const data = found.rows.slice(found.row + 1).filter(hasData);

  const sample = data.slice(0, SAMPLE_ROWS).map((row) => {
    const record: Record<string, string> = {};
    for (const column of recognized) {
      record[column.key] = cellText(row[found.mapping.get(column.key)!]);
    }
    // Algunas exportaciones traen intercambiados los códigos CUOC de denominación (con sufijo «.NNN»)
    // y de ocupación (sin él); el backend los corrige, y la vista previa muestra lo mismo.
    if (type === 'denominacion') {
      const denomination = record['codDenominacionCuoc'];
      const occupation = record['codOcupacionCuoc'];
      if (denomination && occupation && !denomination.includes('.') && occupation.includes('.')) {
        record['codDenominacionCuoc'] = occupation;
        record['codOcupacionCuoc'] = denomination;
      }
    }
    return record;
  });

  return {
    ok: missing.length === 0,
    sheet: found.sheet,
    columns: recognized,
    missing,
    ignored,
    looksLike: missing.length ? guessType(sheets, type) : null,
    totalRows: data.length,
    sample
  };
}

function guessType(sheets: Array<{ name: string; rows: Rows }>, exclude: CorrelativeUploadType): CorrelativeUploadType | null {
  for (const other of CORRELATIVE_UPLOAD_TYPES) {
    if (other === exclude) {
      continue;
    }
    const columns = UPLOAD_COLUMNS[other];
    const matches = sheets.some((sheet) =>
      sheet.rows.slice(0, MAX_HEADER_ROWS).some((row) => Array.isArray(row) && hasRequired(columns, mapRow(row, columns)))
    );
    if (matches) {
      return other;
    }
  }
  return null;
}

/** Filas de cada hoja del libro, tal como las lee `xlsx`. */
export type SheetRows = Array<{ name: string; rows: Rows }>;

/**
 * Lee todas las hojas del archivo con la librería `xlsx`, que se carga aparte (`import()`) la
 * primera vez que se usa, para no agrandar el arranque de la aplicación.
 */
export async function readSheets(file: File): Promise<SheetRows> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null })
  }));
}
