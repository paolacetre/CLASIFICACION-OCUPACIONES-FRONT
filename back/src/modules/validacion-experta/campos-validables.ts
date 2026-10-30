/**
 * Qué campos del snapshot de `pregunta` debe calificar el experto, y con qué
 * identificador llegan en el `campo` del veredicto (que al guardar se enlaza a
 * su fila de `pregunta`).
 *
 * La regla es la MISMA que aplica el frontend al armar el modal
 * (`buildSeccionesDesdeSnapshot`) y hay que mantenerlas alineadas:
 *   - por cada ocupación, un identificador que aparece una sola vez va tal
 *     cual ("nombre", "descripcion");
 *   - si aparece varias veces se numera por orden de aparición, empezando en
 *     1 y por ocupación: "funcion_1", "funcion_2"…
 * Los campos de trazabilidad se muestran como contexto y no se califican.
 */

/** Identificadores del snapshot que el experto NO califica. */
export const CAMPOS_NO_CALIFICABLES = new Set([
  'fecha_registro',
  'fecha_inactividad',
  'trazabilidad',
  'observacion',
]);

export interface CampoValidable {
  codOcupacion: string;
  campo: string;
}

/**
 * Campos calificables, en el orden del snapshot. `ocupacionDe` resuelve la
 * ocupación de cada ítem (la principal para los snapshots antiguos).
 */
export function camposValidablesDeSnapshot<T extends { identificador?: string | null }>(
  items: T[],
  ocupacionDe: (item: T) => string,
): CampoValidable[] {
  return camposDeSnapshot(items, ocupacionDe)
    .filter((campo) => campo.calificable)
    .map(({ codOcupacion, campo }) => ({ codOcupacion, campo }));
}

/**
 * Nombre de campo de CADA ítem del snapshot (también los no calificables),
 * junto con el ítem. Es lo que enlaza el `campo` que manda el frontend con su
 * fila de `pregunta` al guardar la respuesta.
 */
export function camposDeSnapshot<T extends { identificador?: string | null }>(
  items: T[],
  ocupacionDe: (item: T) => string,
): Array<CampoValidable & { item: T; identificador: string; calificable: boolean }> {
  const totales = new Map<string, number>();
  for (const item of items) {
    const clave = `${ocupacionDe(item)}::${item.identificador ?? 'campo'}`;
    totales.set(clave, (totales.get(clave) ?? 0) + 1);
  }

  const vistos = new Map<string, number>();
  return items.map((item) => {
    const identificador = item.identificador ?? 'campo';
    const codOcupacion = ocupacionDe(item);
    const clave = `${codOcupacion}::${identificador}`;
    const ocurrencia = (vistos.get(clave) ?? 0) + 1;
    vistos.set(clave, ocurrencia);

    const esLista = (totales.get(clave) ?? 1) > 1;
    return {
      item,
      identificador,
      codOcupacion,
      campo: esLista ? `${identificador}_${ocurrencia}` : identificador,
      calificable: !CAMPOS_NO_CALIFICABLES.has(identificador),
    };
  });
}

/** Clave única de un campo dentro de la agrupación. */
export function claveCampo(codOcupacion: string, campo: string): string {
  return `${codOcupacion}::${campo}`;
}
