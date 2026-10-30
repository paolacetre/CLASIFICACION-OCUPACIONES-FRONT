/** Tope de palabras: más que esto no afina la búsqueda y solo alarga el SQL. */
const MAX_PALABRAS = 8;

export interface CondicionTexto {
  sql: string;
  params: Record<string, string>;
}

/** Escapa los comodines de LIKE para que "%" o "_" del usuario se busquen literales. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function palabrasDeBusqueda(termino: string): string[] {
  return termino.trim().split(/\s+/).filter(Boolean).slice(0, MAX_PALABRAS);
}

/**
 * Condición SQL de búsqueda de texto para un QueryBuilder:
 *  - sin distinguir mayúsculas NI tildes ("tecnico" encuentra "Técnico"),
 *  - palabra por palabra y en cualquier orden: cada palabra debe aparecer en
 *    alguna de las `columnas` ("ingeniero sistemas" encuentra "Ingenieros de
 *    sistemas").
 *
 * Requiere la extensión `unaccent` (migración 022). Llamadas con el mismo
 * `prefijo` generan los mismos nombres de parámetro, así que una condición
 * para el nombre y otra para una subconsulta pueden compartir los valores.
 * Devuelve `null` si el término no tiene palabras.
 */
export function condicionTexto(columnas: string[], termino: string, prefijo = 'txt'): CondicionTexto | null {
  const palabras = palabrasDeBusqueda(termino);
  if (palabras.length === 0) return null;

  const params: Record<string, string> = {};
  const porPalabra = palabras.map((palabra, i) => {
    const nombre = `${prefijo}${i}`;
    params[nombre] = `%${escaparLike(palabra)}%`;
    const enColumnas = columnas.map((col) => `unaccent(${col}) ILIKE unaccent(:${nombre})`);
    return `(${enColumnas.join(' OR ')})`;
  });

  return { sql: `(${porPalabra.join(' AND ')})`, params };
}

/** Prefijo de código ("211" encuentra 2111, 2112...), con comodines escapados. */
export function prefijoCodigo(termino: string): string {
  return `${escaparLike(termino.trim())}%`;
}

/**
 * Expresión para ordenar por relevancia (menor = más relevante):
 *   0 el código empieza por el término,
 *   1 el nombre empieza por la primera palabra ("Abogados" para "abogado"),
 *   2 el nombre contiene todas las palabras,
 *   3 el resto (coincidió solo por una denominación).
 * Usa los mismos nombres de parámetro que `condicionTexto` con el mismo
 * prefijo, así que se puede combinar con ella en la misma consulta.
 */
export function ordenRelevancia(
  columnaCodigo: string,
  columnaNombre: string,
  termino: string,
  prefijo = 'txt',
): CondicionTexto | null {
  const nombre = condicionTexto([columnaNombre], termino, prefijo);
  if (!nombre) return null;
  const params = {
    ...nombre.params,
    [`${prefijo}_codigo`]: prefijoCodigo(termino),
    [`${prefijo}_inicio`]: `${escaparLike(palabrasDeBusqueda(termino)[0])}%`,
  };
  const sql = `CASE
      WHEN ${columnaCodigo} ILIKE :${prefijo}_codigo THEN 0
      WHEN unaccent(${columnaNombre}) ILIKE unaccent(:${prefijo}_inicio) THEN 1
      WHEN ${nombre.sql} THEN 2
      ELSE 3
    END`;
  return { sql, params };
}
