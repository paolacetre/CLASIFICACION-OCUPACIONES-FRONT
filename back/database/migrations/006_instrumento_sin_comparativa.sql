-- ============================================================
--  006_instrumento_sin_comparativa
--
--  Permite que `instrumento.comparativa_ocupacion_id` sea NULL.
--
--  Por qué: la columna nació NOT NULL porque hasta ahora TODA fila de
--  `instrumento` era de Instrumento 2, y esas siempre provienen de una
--  comparativa creada en Análisis. Instrumento 3 es distinto por naturaleza:
--  es la PROPUESTA de una ocupación que todavía no existe en la CNO, así que
--  no hay ninguna comparativa a la que apuntar. Sin este cambio, crear una
--  propuesta de I3 falla con:
--    null value in column "comparativa_ocupacion_id" violates not-null constraint
--
--  No es destructivo: las filas de Instrumento 2 conservan su valor y la
--  clave foránea sigue vigente; solo se relaja la obligatoriedad. La
--  integridad por tipo se mantiene en código (Instrumento2Service exige
--  comparativa; Instrumento3Service no la usa).
--
--  Idempotente: si la columna ya admite NULL, no hace nada. NO lleva
--  BEGIN/COMMIT: el runner (scripts/db-migrate.js) envuelve cada archivo en
--  su propia transacción.
-- ============================================================

SET search_path TO clasificacion;

DO $$
BEGIN
  IF (
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'clasificacion'
      AND table_name   = 'instrumento'
      AND column_name  = 'comparativa_ocupacion_id'
  ) = 'NO' THEN
    RAISE NOTICE 'Permitiendo NULL en instrumento.comparativa_ocupacion_id (necesario para Instrumento 3)';
    ALTER TABLE clasificacion.instrumento
      ALTER COLUMN comparativa_ocupacion_id DROP NOT NULL;
  END IF;
END $$;
