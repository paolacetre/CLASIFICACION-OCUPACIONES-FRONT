import { FAMILY_NUMBER, ReportCriterion, ReportRecord, dateTime } from './reportes.model';

/** Traduce una clave (la exportación usa los mismos textos de la pantalla). */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** «5. Funciones 1» o «2. Área de desempeño». */
export function criterionTitle(criterion: Pick<ReportCriterion, 'family' | 'n'>, t: Translate): string {
  const label = t(`reportes.family.${criterion.family}`);
  return `${FAMILY_NUMBER[criterion.family]}. ${label}${criterion.n ? ` ${criterion.n}` : ''}`;
}

/** Columna de cada criterio: su familia y número, sin el código de la ocupación (para alinear filas). */
const criterionKey = (criterion: ReportCriterion) => `${criterion.family}|${criterion.n}`;

/** Una hoja más del libro, ya armada fila por fila (p. ej. los porcentajes de Estadísticas). */
export interface ExtraSheet {
  name: string;
  rows: Array<Array<string | number>>;
}

/**
 * Libro de Excel del reporte: una fila por ocupación validada (como `toFilasExporte` de la versión
 * desplegada), con los datos del envío y del informante y una columna por criterio con su
 * calificación y el comentario del experto. `before` son hojas que van antes (las estadísticas).
 * La librería `xlsx` se carga aparte, solo al exportar.
 */
export async function exportRecords(records: ReportRecord[], t: Translate, fileName: string, compact = false, before: ExtraSheet[] = []): Promise<void> {
  const XLSX = await import('xlsx');
  const criteria = new Map<string, ReportCriterion>();
  for (const record of records) {
    for (const occupation of record.occupations) {
      for (const criterion of occupation.criteria) {
        if (!criteria.has(criterionKey(criterion))) criteria.set(criterionKey(criterion), criterion);
      }
    }
  }
  const criterionColumns = [...criteria.values()].sort((a, b) => FAMILY_NUMBER[a.family] - FAMILY_NUMBER[b.family] || a.n - b.n);

  const fixed: Array<[string, (record: ReportRecord, index: number) => string | number]> = compact
    ? [
        [t('reportes.column.id'), (record) => record.id],
        [t('reportes.column.date'), (record) => dateTime(record.date)],
        [t('reportes.column.fullName'), (record) => record.fullName],
        [t('reportes.column.email'), (record) => record.email],
        [t('reportes.column.phone'), (record) => record.phone],
        [t('reportes.column.department'), (record) => record.department],
        [t('reportes.column.city'), (record) => record.city],
        [t('reportes.column.company'), (record) => record.company],
        [t('reportes.column.position'), (record) => record.position]
      ]
    : [
        [t('reportes.column.id'), (record) => record.id],
        [t('reportes.column.group'), (record) => record.group],
        [t('reportes.column.kind'), (record) => t(`reportes.kind.${record.kind}`)],
        [t('reportes.column.startedAt'), (record) => dateTime(record.startedAt)],
        [t('reportes.column.finishedAt'), (record) => dateTime(record.finishedAt)],
        [t('reportes.column.date'), (record) => dateTime(record.date)],
        [t('reportes.column.fullName'), (record) => record.fullName],
        [t('reportes.column.email'), (record) => record.email],
        [t('reportes.column.phone'), (record) => record.phone],
        [t('reportes.column.department'), (record) => record.department],
        [t('reportes.column.city'), (record) => record.city],
        [t('reportes.column.company'), (record) => record.company],
        [t('reportes.column.position'), (record) => record.position],
        [t('reportes.column.profession'), (record) => record.profession],
        [t('reportes.column.sector'), (record) => record.sector]
      ];

  const header = [
    ...fixed.map(([label]) => label),
    t('reportes.column.occupationName'),
    t('reportes.column.cnoCode'),
    t('reportes.column.cuocCode'),
    t('reportes.column.level'),
    ...(compact ? [] : criterionColumns.map((criterion) => criterionTitle(criterion, t))),
    t('reportes.column.evaluation'),
    ...(compact ? [t('reportes.column.score')] : [])
  ];

  const rows = records.flatMap((record, index) =>
    record.occupations.map((occupation) => {
      const byKey = new Map(occupation.criteria.map((criterion) => [criterionKey(criterion), criterion]));
      return [
        ...fixed.map(([, value]) => value(record, index)),
        occupation.name,
        occupation.catalog === 'CNO' ? occupation.code : '',
        occupation.catalog === 'CUOC' ? occupation.code : '',
        occupation.level,
        ...(compact
          ? []
          : criterionColumns.map((column) => {
              const criterion = byKey.get(criterionKey(column));
              if (!criterion) return '';
              const state = t(`reportes.state.${criterion.state}`);
              return criterion.comment ? `${state} — ${criterion.comment}` : state;
            })),
        t(`reportes.evaluation.${occupation.evaluation}`),
        ...(compact ? [`${Math.round(record.score)} %`] : [])
      ];
    })
  );

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet['!cols'] = header.map((label) => ({ wch: Math.min(48, Math.max(12, label.length + 2)) }));
  if (sheet['!ref']) {
    sheet['!autofilter'] = { ref: sheet['!ref'] };
  }
  const book = XLSX.utils.book_new();
  for (const extra of before) {
    const extraSheet = XLSX.utils.aoa_to_sheet(extra.rows);
    extraSheet['!cols'] = (extra.rows[0] ?? []).map((_, column) => ({
      wch: Math.min(48, Math.max(12, ...extra.rows.map((row) => String(row[column] ?? '').length + 2)))
    }));
    XLSX.utils.book_append_sheet(book, extraSheet, extra.name);
  }
  XLSX.utils.book_append_sheet(book, sheet, 'Resumen');
  XLSX.writeFile(book, `${fileName}.xlsx`, { compression: true });
}
