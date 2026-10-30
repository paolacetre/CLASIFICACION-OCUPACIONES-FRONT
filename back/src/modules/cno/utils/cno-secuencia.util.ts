import { EntityManager } from 'typeorm';

/**
 * Calcula el siguiente número consecutivo bajo un lock transaccional
 * (`pg_advisory_xact_lock`, liberado automáticamente al hacer commit/rollback),
 * para serializar la generación de códigos entre transacciones concurrentes
 * que compitan por la misma clave lógica (`lockKey`).
 *
 * El SQL recibido debe devolver una sola fila con una columna `next`.
 */
export async function siguienteConsecutivo(
  manager: EntityManager,
  lockKey: string,
  sql: string,
  params: unknown[],
): Promise<number> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
  const [row] = await manager.query(sql, params);
  return Number(row?.next ?? 1);
}

/**
 * Deja la secuencia SERIAL de `tabla.columna` en MAX + 1.
 *
 * Los catálogos que llegan del Excel (cno_conocimiento, habilidad_destreza)
 * se insertan con su código explícito, y un INSERT así no avanza la secuencia:
 * sin esto, el siguiente INSERT que confíe en el DEFAULT choca contra la PK.
 * Si la columna no tiene secuencia (p. ej. cuoc_conocimiento), no hace nada.
 *
 * `tabla` y `columna` son constantes del código, nunca vienen del usuario.
 */
export async function resincronizarSecuencia(
  manager: EntityManager,
  tabla: string,
  columna: string,
): Promise<void> {
  await manager.query(
    `SELECT setval(s.seq, COALESCE((SELECT MAX(${columna}) FROM clasificacion.${tabla}), 0) + 1, false)
       FROM (SELECT pg_get_serial_sequence($1, $2) AS seq) s
      WHERE s.seq IS NOT NULL`,
    [`clasificacion.${tabla}`, columna],
  );
}
