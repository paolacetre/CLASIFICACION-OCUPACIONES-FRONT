/**
 * Máquina de estados de `instrumento.estado` para filas `tipo='instrumento3'`.
 *
 * Deliberadamente comparte los mismos valores post-experto que Instrumento 2:
 * así Validación Experta trata ambos instrumentos igual, sin ramas por tipo.
 *
 * Flujo: BORRADOR → GUARDADO → ENVIADO_EXPERTO → (VALIDADO | AJUSTES_SOLICITADOS | APROBADO_FINAL)
 */
export enum Instrumento3Estado {
  BORRADOR = 'BORRADOR',
  GUARDADO = 'GUARDADO',
  ENVIADO_EXPERTO = 'ENVIADO_EXPERTO',
  VALIDADO = 'VALIDADO',
  AJUSTES_SOLICITADOS = 'AJUSTES_SOLICITADOS',
  APROBADO_FINAL = 'APROBADO_FINAL',
}

/** Tipo con el que se marcan las filas de `instrumento` que son de I3. */
export const TIPO_INSTRUMENTO3 = 'instrumento3';
