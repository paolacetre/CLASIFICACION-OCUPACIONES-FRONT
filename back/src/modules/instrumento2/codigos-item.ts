/**
 * Códigos de función y denominación tal como se muestran al experto y en los
 * reportes: `<LETRA>-<código real de la ocupación>.<secuencia>`, el mismo
 * formato del catálogo CNO (`F-0011.01`, `D-0011.001`).
 *
 * Las copias que crea Análisis guardan otros formatos ("1222-7-1-D7",
 * "F-1222-7-1.03", en CUOC un entero suelto o "01100-7-1.004") y, en CNO, el
 * snapshot mostraba además el código del catálogo GENÉRICO de funciones
 * ("F-573"), que no dice a qué ocupación pertenece. Aquí se normaliza SOLO la
 * presentación: los códigos guardados en BD no se tocan, porque Análisis y la
 * edición de Instrumento 2 los siguen usando (ver `codigoInterno`).
 */

export type LetraItem = 'F' | 'D';

/** Dígitos de la secuencia por tipo, como en el catálogo CNO. */
const DIGITOS_SECUENCIA: Record<LetraItem, number> = { F: 2, D: 3 };

/**
 * Secuencia que trae un código almacenado: el ÚLTIMO número que aparece en él.
 * Cubre todos los formatos existentes ("…-D12" → 12, "F-0011.01" → 1,
 * "01100.004" → 4, "7" → 7). Null si el código no tiene ningún número.
 */
export function secuenciaDeCodigo(codigo: string | null | undefined): number | null {
  const coincidencia = /(\d+)(?!.*\d)/.exec(codigo ?? '');
  if (!coincidencia) return null;
  const valor = Number.parseInt(coincidencia[1], 10);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Ordena por secuencia NUMÉRICA. Ordenar el código como texto es justo lo que
 * dejaba las denominaciones en desorden (D1, D10, D11, D2…). Los ítems sin
 * secuencia van al final, y un empate conserva el orden de entrada.
 */
export function ordenarPorSecuencia<T>(items: T[], codigoDe: (item: T) => string | null | undefined): T[] {
  return items
    .map((item, indice) => ({ item, indice, secuencia: secuenciaDeCodigo(codigoDe(item)) }))
    .sort((a, b) => {
      const sa = a.secuencia ?? Number.MAX_SAFE_INTEGER;
      const sb = b.secuencia ?? Number.MAX_SAFE_INTEGER;
      return sa - sb || a.indice - b.indice;
    })
    .map(({ item }) => item);
}

/** `F-0112.01` / `D-0112.001`. La secuencia es el consecutivo dentro de la ocupación. */
export function codigoItem(letra: LetraItem, codigoOriginal: string, secuencia: number): string {
  const numero = String(secuencia).padStart(DIGITOS_SECUENCIA[letra], '0');
  return `${letra}-${codigoOriginal}.${numero}`;
}
