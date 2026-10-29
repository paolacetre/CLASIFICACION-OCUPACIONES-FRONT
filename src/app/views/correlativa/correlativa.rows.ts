import { CORRELATIVA_COLUMNS, CorrelationRow, CorrelativaKind, CorrelativaPage, CorrelativaQuery } from './correlativa.model';
import { normalizeText } from '../../shared/ui/list';

/*
 * El backend entrega las correlativas completas y no tiene búsqueda: el texto,
 * los filtros y la paginación se resuelven aquí, sobre las filas ya cargadas.
 */

/** Encabezados del archivo de "Descargar consultadas". */
const EXPORT_HEADERS: Record<string, string> = {
  cnoOccupationCode: 'Código ocupación CNO',
  cnoDenominationCode: 'Código denominación CNO',
  denominationDescription: 'Denominación CNO',
  cuocOccupationCode: 'Código ocupación CUOC',
  cuocDenominationCode: 'Código denominación CUOC',
  description: 'Denominación CUOC',
  status: 'Estado',
  observation: 'Observación',
  name: 'Ocupación CNO',
  cnoDescription: 'Descripción CNO',
  cuocName: 'Ocupación CUOC',
  cuocDescription: 'Descripción CUOC',
  cnoKnowledgeCode: 'Código conocimiento CNO',
  cnoKnowledgeName: 'Nombre conocimiento CNO',
  cuocKnowledgeCode: 'Código conocimiento CUOC',
  cuocKnowledgeName: 'Nombre conocimiento CUOC',
  applied: 'Aplicado'
};

const CODE_FILTERS = ['cnoOccupationCode', 'cnoDenominationCode', 'cuocOccupationCode', 'cuocDenominationCode'] as const;

/** Filas que cumplen el texto (en cualquiera de sus campos de texto) y los filtros de la pestaña. */
export function filterRows(kind: CorrelativaKind, rows: CorrelationRow[], query: CorrelativaQuery): CorrelationRow[] {
  const text = normalizeText(query.text);
  const codes = kind === 'denominacion' ? CODE_FILTERS.filter((field) => query[field].trim()) : [];
  return rows.filter((row) => {
    const values = row as unknown as Record<string, unknown>;
    return (
      (!text || Object.values(values).some((value) => typeof value === 'string' && normalizeText(value).includes(text))) &&
      codes.every((field) => normalizeText(String(values[field] ?? '')).includes(normalizeText(query[field]))) &&
      (kind !== 'denominacion' || !query.status || values['status'] === query.status) &&
      (kind !== 'conocimiento' || !query.applied || values['applied'] === (query.applied === 'si'))
    );
  });
}

/** La página pedida de las filas que cumplen la consulta, y cuántas son en total. */
export function pageOf(kind: CorrelativaKind, rows: CorrelationRow[], query: CorrelativaQuery): CorrelativaPage {
  const matches = filterRows(kind, rows, query);
  const start = (query.page - 1) * query.pageSize;
  return { items: matches.slice(start, start + query.pageSize), total: matches.length };
}

/** CSV (que Excel abre) con las filas de una o varias pestañas, cada una con sus columnas (y la descripción al lado de la columna que la muestra). */
export function toCsv(sections: [CorrelativaKind, CorrelationRow[]][]): Blob {
  const lines: string[][] = [];
  for (const [kind, rows] of sections) {
    const fields = CORRELATIVA_COLUMNS[kind].flatMap((column) => (column.descriptionField ? [column.field, column.descriptionField] : [column.field]));
    lines.push(fields.map((field) => EXPORT_HEADERS[field]));
    for (const row of rows) {
      const values = row as unknown as Record<string, unknown>;
      lines.push(fields.map((field) => (typeof values[field] === 'boolean' ? (values[field] ? 'Sí' : 'No') : String(values[field]))));
    }
    lines.push([]);
  }
  const csv = lines.map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\r\n');
  // El BOM hace que Excel lea las tildes como UTF-8.
  return new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8' });
}
