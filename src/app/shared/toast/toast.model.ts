/** Los tres estados del sistema visual: éxito, error y advertencia. */
export type ToastType = 'success' | 'error' | 'warning';

/** Un aviso en pantalla; `duration` es cuánto tarda en cerrarse solo (ms). */
export interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
  /** Duración en milisegundos antes de autocerrarse. */
  duration: number;
}
