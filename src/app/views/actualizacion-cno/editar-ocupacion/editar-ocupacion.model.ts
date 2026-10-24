/**
 * Modelo de "Ocupación (Editar)" en Actualización: la ocupación completa del
 * catálogo oficial (CNO o CUOC) tal como se edita, y su envío al backend
 * (`PUT /api/analisis/ocupacion-original`, el mismo "panel" de Análisis).
 */
import { PickOption } from '../actualizacion-cno.model';

/** Pestañas del editor. */
export type EditTab = 'basic' | 'denominations' | 'functions' | 'skills' | 'knowledge' | 'related';

/** Pestañas de "Ocupación (Editar)", en orden. */
export const EDIT_TABS: readonly EditTab[] = ['basic', 'denominations', 'functions', 'skills', 'knowledge', 'related'];

/** Pestañas que son listas de un catálogo: se agregan con el selector. */
export type LinkedList = 'skills' | 'knowledge' | 'related';

/**
 * Denominación o función de la ocupación. `code` vacío: es nueva (el servidor le
 * asigna el código al guardar). `active`: `null` si el backend no lo informa (CUOC).
 */
export interface EditableRow {
  /** Identifica la fila en la vista (no viaja). */
  key: number;
  code: string;
  text: string;
  active: boolean | null;
  /** `DD/MM/YYYY`, o vacío. */
  registeredAt: string;
}

/** La ocupación que se edita. Área y nivel se eligen por código; el backend los recibe por nombre. */
export interface EditableOccupation {
  code: string;
  name: string;
  description: string;
  areaCode: string;
  levelCode: string;
  active: boolean;
  /** Solo lectura: `DD/MM/YYYY` o vacío. */
  registeredAt: string;
  inactiveAt: string;
  previousCode: string;
  traceability: string;
  /** Solo CUOC: "0110 · Oficiales de las fuerzas militares". */
  primaryGroup: string;
  denominations: EditableRow[];
  functions: EditableRow[];
  /** Con el código del catálogo (habilidad/destreza, conocimiento u ocupación relacionada). */
  skills: PickOption[];
  knowledge: PickOption[];
  related: PickOption[];
}
