/**
 * Piezas comunes de las listas con búsqueda y paginación (CNO, CUOC,
 * Correlativa, Comparativa, Instrumento 2, Actualización, Validaciones,
 * Reportes). Están aquí una sola vez para que todas se comporten igual.
 */

/** Opciones de "N por página"; la lista empieza en la primera. */
export const PAGE_SIZES = [8, 16, 32];

/** Cantidad máxima de números de página visibles a la vez. */
export const VISIBLE_PAGES = 5;

/** Pausa (ms) entre la última tecla del buscador y la consulta, para no pedir una por letra. */
export const SEARCH_DEBOUNCE_MS = 250;

/** Cantidad de páginas para `total` elementos (mínimo 1, para que la paginación nunca quede en "página 1 de 0"). */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Números de página visibles: hasta `VISIBLE_PAGES`, con la actual en el centro cuando se puede. */
export function visiblePages(page: number, pageCount: number): number[] {
  const count = Math.min(VISIBLE_PAGES, pageCount);
  const first = Math.max(1, Math.min(page - Math.floor(count / 2), pageCount - count + 1));
  return Array.from({ length: count }, (_, index) => first + index);
}

/** Texto en minúsculas, sin tildes ni espacios a los lados: así "Contaduría" se encuentra escribiendo "contaduria". */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}
