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
  cuocOccupationCode: string;
  cuocName: string;
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
  /** Clave de traducción del encabezado. */
  labelKey: string;
  type: ColumnType;
}

/** Columnas de cada pestaña, en el orden en que se muestran. */
export const CORRELATIVA_COLUMNS: Record<CorrelativaKind, CorrelativaColumn[]> = {
  denominacion: [
    { field: 'id', labelKey: 'correlativa.colId', type: 'text' },
    { field: 'cnoOccupationCode', labelKey: 'correlativa.colCnoOccupationCode', type: 'cnoCode' },
    { field: 'cnoDenominationCode', labelKey: 'correlativa.colCnoDenominationCode', type: 'code' },
    { field: 'denominationDescription', labelKey: 'correlativa.colDenominationDescription', type: 'text' },
    { field: 'cuocOccupationCode', labelKey: 'correlativa.colCuocOccupationCode', type: 'cuocCode' },
    { field: 'description', labelKey: 'correlativa.colDescription', type: 'text' },
    { field: 'status', labelKey: 'correlativa.colStatus', type: 'status' },
    { field: 'observation', labelKey: 'correlativa.colObservation', type: 'text' }
  ],
  ocupacion: [
    { field: 'id', labelKey: 'correlativa.colId', type: 'text' },
    { field: 'cnoOccupationCode', labelKey: 'correlativa.colCnoOccupationCode', type: 'cnoCode' },
    { field: 'name', labelKey: 'correlativa.colName', type: 'text' },
    { field: 'cuocOccupationCode', labelKey: 'correlativa.colCuocOccupationCode', type: 'cuocCode' },
    { field: 'cuocName', labelKey: 'correlativa.colCuocName', type: 'text' }
  ],
  conocimiento: [
    { field: 'id', labelKey: 'correlativa.colId', type: 'text' },
    { field: 'cnoKnowledgeCode', labelKey: 'correlativa.colCnoKnowledgeCode', type: 'cnoCode' },
    { field: 'cnoKnowledgeName', labelKey: 'correlativa.colCnoKnowledgeName', type: 'text' },
    { field: 'cuocKnowledgeCode', labelKey: 'correlativa.colCuocKnowledgeCode', type: 'cuocCode' },
    { field: 'cuocKnowledgeName', labelKey: 'correlativa.colCuocKnowledgeName', type: 'text' },
    { field: 'applied', labelKey: 'correlativa.colApplied', type: 'applied' }
  ]
};

/** Filtros vacíos. */
export function createEmptyFilters(): CorrelativaFilters {
  return { status: '', applied: '', cnoOccupationCode: '', cnoDenominationCode: '', cuocOccupationCode: '', cuocDenominationCode: '' };
}

/** Consulta inicial: sin filtros, primera página. */
export function createEmptyQuery(): CorrelativaQuery {
  return { text: '', ...createEmptyFilters(), page: 1, pageSize: PAGE_SIZES[0] };
}
