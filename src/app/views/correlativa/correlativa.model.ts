import { PAGE_SIZES } from '../../shared/ui/list';
/** Qué se correlaciona entre la CNO y la CUOC (una pestaña por tipo). */
export type CorrelativaKind = 'denominacion' | 'ocupacion' | 'conocimiento';

/** Estado de una correlación, tal como lo guarda la base de datos. */
export type CorrelationStatus = 'Activo' | 'Inactivo';

/** Correlación de una denominación de la CNO con una ocupación de la CUOC. */
export interface DenominationCorrelation {
  id: number;
  cnoOccupationCode: string;
  cnoDenominationCode: string;
  denominationDescription: string;
  cuocOccupationCode: string;
  cuocDenominationCode: string;
  description: string;
  status: CorrelationStatus;
  /** Cadena vacía si no tiene. */
  observation: string;
}

/** Correlación de una ocupación de la CNO con una de la CUOC. */
export interface OccupationCorrelation {
  id: number;
  cnoOccupationCode: string;
  name: string;
  /** Descripción vigente de la ocupación en el catálogo CNO; cadena vacía si no tiene. */
  cnoDescription: string;
  cuocOccupationCode: string;
  cuocName: string;
  /** Descripción vigente de la ocupación en el catálogo CUOC; cadena vacía si no tiene. */
  cuocDescription: string;
  /** Cadena vacía si no tiene. */
  observation: string;
}

/** Correlación de un conocimiento de la CNO con uno de la CUOC. */
export interface KnowledgeCorrelation {
  id: number;
  cnoKnowledgeCode: string;
  cnoKnowledgeName: string;
  cuocKnowledgeCode: string;
  cuocKnowledgeName: string;
  applied: boolean;
}

/** Una fila de cualquiera de las tres pestañas (denominación, ocupación o conocimiento). */
export type CorrelationRow = DenominationCorrelation | OccupationCorrelation | KnowledgeCorrelation;

/** Filtros de la tarjeta de búsqueda; una cadena vacía significa "sin filtrar". */
export interface CorrelativaFilters {
  /** Solo aplica a Denominación. */
  status: CorrelationStatus | '';
  /** Solo aplica a Conocimiento. */
  applied: 'si' | 'no' | '';
  /** Códigos (coincidencia parcial); solo aplican a Denominación. */
  cnoOccupationCode: string;
  cnoDenominationCode: string;
  cuocOccupationCode: string;
  cuocDenominationCode: string;
}

/** Consulta de una pestaña; una cadena vacía significa "sin filtrar". */
export interface CorrelativaQuery extends CorrelativaFilters {
  /** Código o parte del nombre. */
  text: string;
  /** Página pedida, desde 1. */
  page: number;
  pageSize: number;
}

/** Una página de resultados y el total de registros que cumplen la consulta. */
export interface CorrelativaPage {
  items: CorrelationRow[];
  total: number;
}

/** Archivo que entrega una descarga. */
export interface CorrelativaExport {
  blob: Blob;
  fileName: string;
}

/** Cómo se pinta una celda de la tabla. */
export type ColumnType = 'text' | 'cnoCode' | 'cuocCode' | 'code' | 'status' | 'applied';

/** Columna de la tabla de una pestaña. */
export interface CorrelativaColumn {
  /** Campo de la fila. */
  field: string;
  /** Clave de traducción del nombre completo de la columna (la etiqueta del dato cuando la tabla pasa a fichas). */
  labelKey: string;
  type: ColumnType;
  /** Campo con una descripción que se pinta bajo el texto, recortada a dos líneas con «Ver más». */
  descriptionField?: string;
  /**
   * Texto principal de un lado: las dos (CNO y CUOC) se reparten por igual el ancho que dejan las
   * demás, así no cambian de tamaño al pasar de página según lo largo de cada texto.
   */
  wide?: boolean;
}

/**
 * Celda del encabezado, como en el original: «CNO» y «CUOC» (cada uno con su color) sobre los
 * títulos cortos de sus columnas, y lo que no es de un lado ocupando las dos filas.
 */
export interface HeaderCell {
  labelKey: string;
  colspan?: number;
  rowspan?: number;
  /** Título de grupo: centrado sobre sus columnas y con el color de su clasificación. */
  group?: 'cno' | 'cuoc';
}

/** Columnas de cada pestaña, en el orden en que se muestran (el id de la fila no se muestra, como en el original). */
export const CORRELATIVA_COLUMNS: Record<CorrelativaKind, CorrelativaColumn[]> = {
  denominacion: [
    { field: 'cnoOccupationCode', labelKey: 'correlativa.colCnoOccupationCode', type: 'cnoCode' },
    { field: 'cnoDenominationCode', labelKey: 'correlativa.colCnoDenominationCode', type: 'code' },
    { field: 'denominationDescription', labelKey: 'correlativa.colCnoDenomination', type: 'text', wide: true },
    { field: 'cuocOccupationCode', labelKey: 'correlativa.colCuocOccupationCode', type: 'cuocCode' },
    { field: 'cuocDenominationCode', labelKey: 'correlativa.colCuocDenominationCode', type: 'code' },
    { field: 'description', labelKey: 'correlativa.colCuocDenomination', type: 'text', wide: true },
    { field: 'status', labelKey: 'correlativa.colStatus', type: 'status' },
    { field: 'observation', labelKey: 'correlativa.colObservation', type: 'text' }
  ],
  ocupacion: [
    { field: 'cnoOccupationCode', labelKey: 'correlativa.colCnoOccupationCode', type: 'cnoCode' },
    { field: 'name', labelKey: 'correlativa.colCnoOccupation', type: 'text', descriptionField: 'cnoDescription', wide: true },
    { field: 'cuocOccupationCode', labelKey: 'correlativa.colCuocOccupationCode', type: 'cuocCode' },
    { field: 'cuocName', labelKey: 'correlativa.colCuocOccupation', type: 'text', descriptionField: 'cuocDescription', wide: true },
    { field: 'observation', labelKey: 'correlativa.colObservation', type: 'text' }
  ],
  conocimiento: [
    { field: 'cnoKnowledgeCode', labelKey: 'correlativa.colCnoKnowledgeCode', type: 'cnoCode' },
    { field: 'cnoKnowledgeName', labelKey: 'correlativa.colCnoKnowledgeName', type: 'text', wide: true },
    { field: 'cuocKnowledgeCode', labelKey: 'correlativa.colCuocKnowledgeCode', type: 'cuocCode' },
    { field: 'cuocKnowledgeName', labelKey: 'correlativa.colCuocKnowledgeName', type: 'text', wide: true },
    { field: 'applied', labelKey: 'correlativa.colApplied', type: 'applied' }
  ]
};

/** Encabezado en dos filas: «CNO» y «CUOC» sobre los títulos de sus columnas. */
function groupedHeader(side: HeaderCell[], after: HeaderCell[]): HeaderCell[][] {
  return [
    [
      { labelKey: 'correlativa.groupCno', colspan: side.length, group: 'cno' },
      { labelKey: 'correlativa.groupCuoc', colspan: side.length, group: 'cuoc' },
      ...after.map((cell) => ({ ...cell, rowspan: 2 }))
    ],
    [...side, ...side]
  ];
}

/** Filas del encabezado de cada pestaña; sus celdas cubren exactamente las columnas de `CORRELATIVA_COLUMNS`. */
export const CORRELATIVA_HEADERS: Record<CorrelativaKind, HeaderCell[][]> = {
  denominacion: groupedHeader(
    [{ labelKey: 'correlativa.headOccupationCode' }, { labelKey: 'correlativa.headDenominationCode' }, { labelKey: 'correlativa.headDenomination' }],
    [{ labelKey: 'correlativa.colStatus' }, { labelKey: 'correlativa.colObservation' }]
  ),
  ocupacion: groupedHeader(
    [{ labelKey: 'correlativa.headOccupationCode' }, { labelKey: 'correlativa.headOccupation' }],
    [{ labelKey: 'correlativa.colObservation' }]
  ),
  conocimiento: groupedHeader(
    [{ labelKey: 'correlativa.headKnowledgeCode' }, { labelKey: 'correlativa.headKnowledge' }],
    [{ labelKey: 'correlativa.colApplied' }]
  )
};

/** Filtros vacíos. */
export function createEmptyFilters(): CorrelativaFilters {
  return { status: '', applied: '', cnoOccupationCode: '', cnoDenominationCode: '', cuocOccupationCode: '', cuocDenominationCode: '' };
}

/** Consulta inicial: sin filtros, primera página. */
export function createEmptyQuery(): CorrelativaQuery {
  return { text: '', ...createEmptyFilters(), page: 1, pageSize: PAGE_SIZES[0] };
}
