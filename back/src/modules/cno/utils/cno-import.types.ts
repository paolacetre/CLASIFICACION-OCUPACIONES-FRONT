export interface ImportErrorDetail {
  sheet: string;
  excelRow: number;
  operation: string;
  ocupacionCodigo?: string;
  ocupacionNombre?: string;
  relatedCodigo?: string;
  relatedNombre?: string;
  originalMessage: string;
}

export interface SheetResult {
  sheet: string;
  tableName: string;
  message: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  /** Detalle exacto (codigo + motivo) de cada fila contada en "skipped", para poder verificar
   *  que realmente ya existia y no es un dato que deberia haberse creado. */
  skippedDetails: string[];
  /**
   * Filas que no se pudieron leer (columna obligatoria vacia o encabezado desconocido).
   * Se cuentan aparte de `skipped` porque no son lo mismo: una fila omitida ya existia
   * en la base y no pasa nada, mientras que una ilegible es un dato del Excel que se
   * perdio. Mezclarlas fue lo que dejo pasar inadvertido que dos hojas enteras no se
   * cargaran; con este contador el mensaje final ya no puede decir "con exito".
   */
  unreadable: number;
  /**
   * Avisos que no impiden cargar la fila pero delatan un problema en la plantilla:
   * descripciones vacias, nombres que no coinciden con el catalogo, hojas presentes
   * que nadie procesa. No son errores (la fila entra igual) ni omisiones (no se
   * salto nada); son datos que conviene corregir en el Excel.
   */
  warnings: string[];
  /**
   * Lo que el cargue cambió para dejar la base igual al Excel (p. ej. desactivó
   * lo que ya no viene). Es informativo: no hay nada que corregir, por eso no
   * va en `warnings`.
   */
  changes: string[];
}

export interface BulkUploadResult {
  message: string;
  totalInserted: number;
  totalUpdated: number;
  totalSkipped: number;
  /** Total de filas del Excel que no se pudieron leer. Si es > 0 se perdieron datos. */
  totalUnreadable: number;
  totalErrors: number;
  totalWarnings: number;
  /** Tiempo total de procesamiento en milisegundos (desde que se lee el buffer hasta el resultado final). */
  elapsedMs: number;
  sheets: SheetResult[];
}

export function newSheetResult(sheet: string, tableName: string): SheetResult {
  return {
    sheet,
    tableName,
    message: '',
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    skippedDetails: [],
    unreadable: 0,
    warnings: [],
    changes: [],
  };
}
