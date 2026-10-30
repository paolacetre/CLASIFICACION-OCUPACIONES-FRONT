import { EntityManager } from 'typeorm';

import { Pregunta } from './entities/pregunta.entity';
import { PreguntaRespuesta } from './entities/pregunta-respuesta.entity';

/**
 * Rondas del snapshot de `pregunta` (migración 029).
 *
 * Los expertos responden sobre filas concretas de `pregunta` (FK desde
 * `pregunta_respuesta`). Por eso una ronda que ya tiene respuestas se congela:
 * si el analista corrige y vuelve a enviar, el snapshot nuevo se escribe en la
 * ronda siguiente y las respuestas anteriores siguen apuntando a lo que de
 * verdad vieron. Lo vigente es siempre la ronda más alta.
 */

/** Ronda vigente de un instrumento: la más alta de su snapshot (1 si no tiene). */
export async function rondaVigente(manager: EntityManager, idInstrumento: number): Promise<number> {
  const fila = await manager
    .createQueryBuilder(Pregunta, 'p')
    .select('MAX(p.ronda)', 'ronda')
    .where('p.id_instrumento = :idInstrumento', { idInstrumento })
    .getRawOne<{ ronda: number | null }>();
  return Number(fila?.ronda) || 1;
}

/**
 * Deja lista la ronda donde escribir un snapshot nuevo y devuelve su número.
 *
 * Si la ronda vigente aún no tiene respuestas se borra y se reutiliza (el
 * analista sigue editando antes de enviar). Si ya tiene, no se toca y se
 * devuelve la siguiente.
 */
export async function prepararRondaParaEscribir(
  manager: EntityManager,
  idInstrumento: number,
): Promise<number> {
  const ronda = await rondaVigente(manager, idInstrumento);

  const respondida = await manager
    .createQueryBuilder(PreguntaRespuesta, 'pr')
    .innerJoin('pr.pregunta', 'p')
    .where('p.id_instrumento = :idInstrumento', { idInstrumento })
    .andWhere('p.ronda = :ronda', { ronda })
    .getExists();
  if (respondida) return ronda + 1;

  await manager.delete(Pregunta, { instrumento: { idInstrumento } as any, ronda });
  return ronda;
}

/**
 * De un lote de filas de `pregunta` de varios instrumentos, deja solo las de
 * la ronda vigente de cada uno.
 */
export function soloRondaVigente<T extends { ronda: number }>(
  filas: T[],
  instrumentoDe: (fila: T) => number,
): T[] {
  const maxima = new Map<number, number>();
  for (const fila of filas) {
    const id = instrumentoDe(fila);
    maxima.set(id, Math.max(maxima.get(id) ?? 0, fila.ronda ?? 1));
  }
  return filas.filter((fila) => (fila.ronda ?? 1) === maxima.get(instrumentoDe(fila)));
}
