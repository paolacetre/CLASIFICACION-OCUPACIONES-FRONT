/** Catálogo del que viene una ocupación. */
export type AnalysisCatalog = 'CNO' | 'CUOC';

/** Cuántas ocupaciones caben en un análisis y cuántas hacen falta para guardarlo. */
export const MAX_OCCUPATIONS = 3;
/** Mínimo de ocupaciones para guardar un análisis (el máximo es 3). */
export const MIN_OCCUPATIONS = 2;

/** Ocupación encontrada en el buscador. */
export interface AnalysisSearchResult {
  catalog: AnalysisCatalog;
  code: string;
  name: string;
  /** Área a la que pertenece (de desempeño en CNO, de cualificación en CUOC); cadena vacía si no la tiene. */
  area: string;
}

/** Componente de una ocupación (función, habilidad, conocimiento, denominación u ocupación relacionada). */
export interface AnalysisItem {
  /**
   * Código del componente: 'F-2111.01' (función), 'D-2111.001' (denominación),
   * su número (habilidad, conocimiento) o, en una relacionada, el código de esa
   * ocupación ('R-2111.01' si se agregó a mano en Análisis).
    */
  code: string;
  text: string;
}

/** Listas editables de una ocupación (una pestaña cada una). */
export type AnalysisListKey = 'functions' | 'skills' | 'knowledge' | 'denominations' | 'related';

/** Ocupación dentro de un análisis: lo que se ve en la ficha y lo que se edita en la copia. */
export interface AnalysisOccupation {
  catalog: AnalysisCatalog;
  code: string;
  /** Tal como lo guarda la base de datos ('Activo' / 'Inactivo'). */
  status: string;
  name: string;
  /** Nombre del nivel de cualificación (del catálogo o uno nuevo creado para el análisis). */
  level: string;
  /** Código del nivel ("Nivel 1 (A)"), que es como lo muestra la ficha; el backend lo resuelve por `level`. */
  levelCode?: string;
  /** Nombre del área de desempeño. */
  area: string;
  description: string;
  functions: AnalysisItem[];
  skills: AnalysisItem[];
  knowledge: AnalysisItem[];
  denominations: AnalysisItem[];
  related: AnalysisItem[];
  /** Fecha de registro tal como la guarda la base de datos; cadena vacía si no hay dato. */
  registeredAt: string;
  /** Fecha de inactivación (DD/MM/YYYY), si la tiene: la muestra el detalle de Instrumento 2. */
  inactiveAt?: string;
  /** Información adicional: trazabilidad de la ocupación (editable en la copia). */
  traceability: string;
  /**
   * Código de la copia que creó Análisis (`<original>-<comparativa>-<posición>`). Solo en las ocupaciones de una
   * comparativa: es el `codigoOcupacion` con que Comparativa guarda los cambios de cada una.
    */
  copyCode?: string;
}

/** Nivel de cualificación creado para Análisis: una copia que no modifica el catálogo oficial. */
export interface AnalysisLevel {
  /** Lo asigna el servidor al guardar: C1, C2, C3… */
  code: string;
  catalog: AnalysisCatalog;
  name: string;
  description: string;
}

/** Datos que se escriben al crear un nivel para Análisis. */
export interface AnalysisLevelDraft {
  name: string;
  description: string;
}

/** Largo máximo de la descripción de un nivel creado para Análisis. */
export const LEVEL_DESCRIPTION_MAX = 1000;

/** Nombre completo del nivel: en la CNO lleva su código (Nivel 1 (A) - Profesionales…). */
export function levelText(item: { level: string; levelCode?: string }): string {
  return item.levelCode && item.levelCode !== item.level ? `${item.levelCode} - ${item.level}` : item.level;
}

/** Opciones de los desplegables de la copia editable, por catálogo. */
export interface AnalysisOptions {
  /** Niveles del catálogo oficial y, al final, los creados para Análisis. */
  levels: string[];
  /** Texto que se muestra por nivel cuando difiere de su nombre (la CNO muestra el código). */
  levelLabels?: Record<string, string>;
  areas: string[];
}

/** Espacio del análisis: la ocupación original (solo vista) y su copia editable. */
export interface AnalysisSlot {
  original: AnalysisOccupation;
  draft: AnalysisOccupation;
}

/** Archivo que entrega la descarga. */
export interface AnalysisExport {
  blob: Blob;
  fileName: string;
}

/**
 * Código del componente número `position` (desde 1) de una ocupación: las
 * funciones son 'F-2111.01', las relacionadas agregadas a mano 'R-2111.01', las
 * denominaciones 'D-2111.001' y las habilidades y los conocimientos llevan solo
 * su número.
  */
export function itemCode(list: AnalysisListKey, occupationCode: string, position: number): string {
  if (list === 'functions' || list === 'related') {
    return `${list === 'functions' ? 'F' : 'R'}-${occupationCode}.${String(position).padStart(2, '0')}`;
  }
  return list === 'denominations' ? `D-${occupationCode}.${String(position).padStart(3, '0')}` : String(position);
}

/** Campos obligatorios de la copia que están vacíos. */
export function missingFields(occupation: AnalysisOccupation): ('name' | 'level' | 'area' | 'description')[] {
  return (['name', 'level', 'area', 'description'] as const).filter((field) => !occupation[field].trim());
}
