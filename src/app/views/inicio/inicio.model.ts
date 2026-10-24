/** Color de la etiqueta de un indicador (clases `ui-badge-*`). */
export type IndicatorTone = 'info' | 'neutral' | 'warn';

/** Indicador del resumen de Inicio (una tarjeta): un total que entrega el backend. */
export interface Indicator {
  id: 'cno' | 'cuoc' | 'correlativa' | 'instrumentos';
  /** Clave de traducción del nombre del indicador. */
  labelKey: string;
  /** Clave de traducción de la etiqueta de la esquina. */
  badgeKey: string;
  badgeTone: IndicatorTone;
  /** Total actual; `null` si no se pudo consultar. */
  value: number | null;
}

/** Registro de la bitácora de trazabilidad (`GET /api/bitacora`): una acción de quien tiene la sesión. */
export interface ActivityEntry {
  id: number;
  /** Módulo al que pertenece: 'cno', 'cuoc', 'correlacion'… */
  type: string;
  title: string;
  detail: string;
  /** Fecha y hora en formato ISO, como la entrega el backend. */
  date: string;
}

/** Las tarjetas de Inicio, sin su valor (lo pone el servicio). */
export function createIndicators(): Indicator[] {
  return [
    { id: 'cno', labelKey: 'inicio.cnoLabel', badgeKey: 'nav.cno', badgeTone: 'info', value: null },
    { id: 'cuoc', labelKey: 'inicio.cuocLabel', badgeKey: 'nav.cuoc', badgeTone: 'neutral', value: null },
    { id: 'correlativa', labelKey: 'inicio.correlativaLabel', badgeKey: 'inicio.correlativaBadge', badgeTone: 'info', value: null },
    { id: 'instrumentos', labelKey: 'inicio.instrumentosLabel', badgeKey: 'inicio.activeBadge', badgeTone: 'warn', value: null }
  ];
}
