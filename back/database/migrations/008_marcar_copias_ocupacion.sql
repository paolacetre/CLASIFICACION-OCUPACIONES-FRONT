-- ============================================================
--  008_marcar_copias_ocupacion
--
--  Rellena `id_comparativa` en las copias de ocupación que Análisis generó
--  antes de que el código lo hiciera.
--
--  Por qué: las copias viven en las MISMAS tablas que el catálogo real
--  (`cno_ocupacion` / `cuoc_ocupacion`), distinguidas solo por un código
--  derivado — "3113-25-1" = original 3113, comparativa 25, panel 1. La columna
--  `id_comparativa` existía en la entidad pero nunca se escribía: estaba NULL
--  en las 623 filas CNO y las 688 CUOC, copias incluidas.
--
--  Eso dejaba dos agujeros:
--    1. No había forma fiable de saber si una fila era copia o catálogo, así
--       que la protección del original dependía de que quien llamara pasara
--       siempre el código correcto. Ahora `assertEsCopia()` usa esta columna.
--    2. `extraerCodigoOriginal(codigo, idComparativa)` devolvía el código sin
--       recortar, y en Instrumento 2 se seguía mostrando "0112-14" en vez de
--       "0112".
--
--  Cómo se deduce la comparativa: por el vínculo real `instrumento` →
--  `comparativa_ocupacion`, NO recortando dígitos del código. Cada comparativa
--  guarda hasta 3 códigos CNO y 3 CUOC en sus columnas cod_ocupacion_*; se
--  marcan exactamente esas filas.
--
--  Solo toca filas con `id_comparativa IS NULL` y cuyo código esté referenciado
--  por una comparativa: una ocupación real del catálogo nunca aparece ahí, así
--  que el catálogo queda intacto. Idempotente: repetirla no cambia nada.
--
--  NO lleva BEGIN/COMMIT: el runner (scripts/db-migrate.js) envuelve cada
--  archivo en su propia transacción.
-- ============================================================

-- ── CNO ─────────────────────────────────────────────────────────────────────
UPDATE clasificacion.cno_ocupacion o
SET    id_comparativa = c.codigo
FROM   clasificacion.comparativa_ocupacion c
WHERE  o.id_comparativa IS NULL
  AND  o.cod_ocupacion_cno IN (c.cod_ocupacion_cno, c.cod_ocupacion_cno2, c.cod_ocupacion_cno3)
  -- Salvaguarda: comparativas antiguas podían guardar el código ORIGINAL en
  -- sus columnas. Ese apunta al catálogo y jamás debe marcarse como copia.
  -- Los paréntesis son necesarios: OR tiene menor precedencia que AND y sin
  -- ellos la segunda rama se evaluaría suelta, marcando filas de otra
  -- comparativa.
  AND  (
         o.cod_ocupacion_cno LIKE '%-' || c.codigo::text
      OR o.cod_ocupacion_cno LIKE '%-' || c.codigo::text || '-%'
       );

-- ── CUOC ────────────────────────────────────────────────────────────────────
UPDATE clasificacion.cuoc_ocupacion o
SET    id_comparativa = c.codigo
FROM   clasificacion.comparativa_ocupacion c
WHERE  o.id_comparativa IS NULL
  AND  o.cod_ocupacion_cuoc IN (c.cod_ocupacion_cuoc, c.cod_ocupacion_cuoc2, c.cod_ocupacion_cuoc3)
  AND  (
         o.cod_ocupacion_cuoc LIKE '%-' || c.codigo::text
      OR o.cod_ocupacion_cuoc LIKE '%-' || c.codigo::text || '-%'
       );
