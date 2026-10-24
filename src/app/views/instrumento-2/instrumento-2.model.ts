import { AnalysisOccupation } from '../analisis/analisis.model';

/**
 * Estado de un instrumento 2, tal como lo guarda el backend. Los que importan
 * en esta bandeja:
 * - GUARDADO: listo para enviar al experto (llegó de Análisis o de Comparativa).
 * - ENVIADO_EXPERTO: en manos del experto.
 * - AJUSTES_SOLICITADOS: el experto pidió cambios.
 * - VALIDADO / APROBADO_FINAL: el experto ya emitió su veredicto.
 */
export type Instrument2State = string;

/** Estados que ya salieron de manos del analista, en cualquier punto del ciclo del experto. */
export const SENT_STATES: readonly Instrument2State[] = ['ENVIADO_EXPERTO', 'AJUSTES_SOLICITADOS', 'VALIDADO', 'APROBADO_FINAL'];

/**
 * Lo único que muestra esta bandeja. PENDIENTE y EN_REVISION quedan fuera a
 * propósito: son comparativas que todavía se trabajan en Comparativa y entran
 * aquí cuando se envían a Instrumento 2 (GUARDADO).
 */
export const VISIBLE_STATES: readonly Instrument2State[] = ['GUARDADO', ...SENT_STATES];

/** Pestañas de la bandeja (las mismas de los indicadores). */
export type Instrument2Tab = 'pending' | 'validation' | 'adjustments' | 'sent' | 'all';

/** Pestañas de la bandeja, en el orden en que se muestran. */
export const INSTRUMENT2_TABS: readonly Instrument2Tab[] = ['pending', 'validation', 'adjustments', 'sent', 'all'];

/** Fila de la bandeja: una comparativa con sus 2 o 3 ocupaciones. */
export interface Instrument2Item {
  id: number;
  state: Instrument2State;
  /** Solo lo que trae la lista: catálogo, código, nombre, nivel y área. */
  occupations: AnalysisOccupation[];
  /** Usuario de quien la guardó en Análisis. */
  analyst: string;
  /** Día en que llegó de Análisis ('06 oct 2026') y su hora ('11:50 a. m.'); vacíos si no hay fecha. */
  day: string;
  time: string;
}

/** Instrumento abierto: sus ocupaciones completas, en solo lectura. */
export interface Instrument2Detail extends Instrument2Item {
  /** Observación que el analista escribió en Comparativa. */
  observation: string;
}

/** Solo lo que está GUARDADO admite enviarse al experto (la misma regla del backend). */
export function canSendToExpert(state: Instrument2State): boolean {
  return state === 'GUARDADO';
}

/** A qué pestaña pertenece un instrumento. */
export function belongsToTab(state: Instrument2State, tab: Instrument2Tab): boolean {
  switch (tab) {
    case 'pending':
      return state === 'GUARDADO';
    case 'validation':
      return state === 'ENVIADO_EXPERTO';
    case 'adjustments':
      return state === 'AJUSTES_SOLICITADOS';
    case 'sent':
      return SENT_STATES.includes(state);
    case 'all':
      return true;
  }
}

/** Filas por página de la bandeja. */

/** Experto que puede recibir el envío (`GET /api/instrumento2/expertos-disponibles`). */
export interface Expert {
  /** `idUsuario` del backend: es lo que viaja en `expertos`. */
  id: number;
  name: string;
  email: string;
}

/** Qué se envía de un instrumento: los códigos de las copias marcadas y los expertos elegidos. */
export interface ExpertSelection {
  occupations: string[];
  experts: number[];
}
