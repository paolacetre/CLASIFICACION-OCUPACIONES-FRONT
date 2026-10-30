/**
 * Máquina de estados de `instrumento.estado` para filas `tipo='instrumento2'`.
 * `instrumento.estado` es una columna de texto libre en BD (sin CHECK
 * constraint): la validez de estos valores se controla solo aquí, en código.
 */
export enum Instrumento2Estado {
  PENDIENTE = 'PENDIENTE',
  EN_REVISION = 'EN_REVISION',
  GUARDADO = 'GUARDADO',
  ENVIADO_EXPERTO = 'ENVIADO_EXPERTO',
  // ── Estados posteriores a la validación experta (migración 004) ──
  // El experto cierra el ciclo: el instrumento sale de la bandeja de
  // pendientes pero sigue siendo consultable con su veredicto.
  VALIDADO = 'VALIDADO',
  AJUSTES_SOLICITADOS = 'AJUSTES_SOLICITADOS',
  APROBADO_FINAL = 'APROBADO_FINAL',
}

/** Estados en los que el instrumento ya pasó por el experto. */
export const ESTADOS_REVISADOS: readonly Instrumento2Estado[] = [
  Instrumento2Estado.VALIDADO,
  Instrumento2Estado.AJUSTES_SOLICITADOS,
  Instrumento2Estado.APROBADO_FINAL,
];
