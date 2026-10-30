-- ============================================================================
-- 033 · clasificacion.correlativa -> clasificacion.correlativa_denominacion
-- ============================================================================
--
-- La correlativa CNO <-> CUOC por denominación queda con el mismo patrón de
-- nombre que correlativa_ocupacion y correlativa_conocimiento. Es un RENAME:
-- las filas, los códigos y la secuencia se conservan tal cual.
--
-- También se renombran la secuencia, la PK y las FK, y se crean los índices,
-- para que la tabla quede idéntica a la de init/01-schema.sql.
--
-- Casos:
--   - Solo existe `correlativa` (lo normal tras la 032): se renombra.
--   - Solo existe `correlativa_denominacion` (BD nueva, o ya migrada): no-op.
--   - Existen las dos: la 032 no corrió como se esperaba. Se aborta en vez de
--     elegir a ciegas cuál borrar.
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('clasificacion.correlativa') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('clasificacion.correlativa_denominacion') IS NOT NULL THEN
    RAISE EXCEPTION 'Existen clasificacion.correlativa y clasificacion.correlativa_denominacion a la vez. Revisar a mano cuál conservar antes de migrar.';
  END IF;

  ALTER TABLE clasificacion.correlativa RENAME TO correlativa_denominacion;

  IF to_regclass('clasificacion.correlativa_codigo_seq') IS NOT NULL THEN
    ALTER SEQUENCE clasificacion.correlativa_codigo_seq RENAME TO correlativa_denominacion_codigo_seq;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'correlativa_pkey'
               AND conrelid = 'clasificacion.correlativa_denominacion'::regclass) THEN
    ALTER TABLE clasificacion.correlativa_denominacion
      RENAME CONSTRAINT correlativa_pkey TO correlativa_denominacion_pkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_correlativa_cno_reg_denominacion1'
               AND conrelid = 'clasificacion.correlativa_denominacion'::regclass) THEN
    ALTER TABLE clasificacion.correlativa_denominacion
      RENAME CONSTRAINT fk_correlativa_cno_reg_denominacion1 TO fk_correlativa_denom_cno_denominacion;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_correlativa_cuoc_denominacion1'
               AND conrelid = 'clasificacion.correlativa_denominacion'::regclass) THEN
    ALTER TABLE clasificacion.correlativa_denominacion
      RENAME CONSTRAINT fk_correlativa_cuoc_denominacion1 TO fk_correlativa_denom_cuoc_denominacion;
  END IF;

  -- PostgreSQL 18 nombra también los NOT NULL (correlativa_<col>_not_null).
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'clasificacion.correlativa_denominacion'::regclass
       AND conname LIKE 'correlativa\_%\_not\_null'
       AND conname NOT LIKE 'correlativa\_denominacion\_%'
  LOOP
    EXECUTE format('ALTER TABLE clasificacion.correlativa_denominacion RENAME CONSTRAINT %I TO %I',
                   r.conname, 'correlativa_denominacion_' || substr(r.conname, length('correlativa_') + 1));
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cno_ocup
  ON clasificacion.correlativa_denominacion (cod_ocupacion_cno);
CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cno_denom
  ON clasificacion.correlativa_denominacion (cod_denominacion_cno);
CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cuoc_ocup
  ON clasificacion.correlativa_denominacion (cod_ocupacion_cuoc);
CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cuoc_denom
  ON clasificacion.correlativa_denominacion (cod_denominacion_cuoc);
