-- ============================================================
--  011_marcar_copias_legado
--
--  Marca las copias antiguas que la 008 dejó fuera.
--
--  Por qué: la 008 exigía que el código terminara en el `codigo` de su propia
--  comparativa ("2113-23-1" → comparativa 23). Esa salvaguarda existía para no
--  marcar como copia un código ORIGINAL guardado en las columnas
--  cod_ocupacion_* de comparativas viejas. Pero hay copias más antiguas cuyo
--  sufijo NO es el de su comparativa: el instrumento 5 usa "0112-14" y cuelga
--  de la comparativa 15. Al quedar sin `id_comparativa`, la nueva guarda
--  `assertEsCopia()` habría rechazado cualquier edición de ese instrumento.
--
--  Regla más precisa, sin depender del número del sufijo: el código está
--  referenciado por una comparativa Y, al quitarle el sufijo derivado
--  (`-N` o `-N-M`), queda un código que EXISTE en la misma tabla. Eso prueba
--  que es un código derivado de una ocupación real. Un código original
--  referenciado directamente no cumple: al recortarlo no queda nada que exista.
--
--  Idempotente: solo toca filas con `id_comparativa IS NULL`.
--
--  NO lleva BEGIN/COMMIT: el runner envuelve cada archivo en su transacción.
-- ============================================================

-- ── CNO ─────────────────────────────────────────────────────────────────────
UPDATE clasificacion.cno_ocupacion o
SET    id_comparativa = c.codigo
FROM   clasificacion.comparativa_ocupacion c
WHERE  o.id_comparativa IS NULL
  AND  o.cod_ocupacion_cno IN (c.cod_ocupacion_cno, c.cod_ocupacion_cno2, c.cod_ocupacion_cno3)
  AND  o.cod_ocupacion_cno ~ '-[0-9]+(-[0-9]+)?$'
  AND  EXISTS (
         SELECT 1
         FROM   clasificacion.cno_ocupacion base
         WHERE  base.cod_ocupacion_cno = regexp_replace(o.cod_ocupacion_cno, '-[0-9]+(-[0-9]+)?$', '')
       );

-- ── CUOC ────────────────────────────────────────────────────────────────────
UPDATE clasificacion.cuoc_ocupacion o
SET    id_comparativa = c.codigo
FROM   clasificacion.comparativa_ocupacion c
WHERE  o.id_comparativa IS NULL
  AND  o.cod_ocupacion_cuoc IN (c.cod_ocupacion_cuoc, c.cod_ocupacion_cuoc2, c.cod_ocupacion_cuoc3)
  AND  o.cod_ocupacion_cuoc ~ '-[0-9]+(-[0-9]+)?$'
  AND  EXISTS (
         SELECT 1
         FROM   clasificacion.cuoc_ocupacion base
         WHERE  base.cod_ocupacion_cuoc = regexp_replace(o.cod_ocupacion_cuoc, '-[0-9]+(-[0-9]+)?$', '')
       );
