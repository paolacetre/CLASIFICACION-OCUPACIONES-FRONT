-- ============================================================================
-- 028 · Validación experta multi-ocupación
-- ============================================================================
--
-- Un Instrumento 2 agrupa hasta 3 ocupaciones (las que junta la comparativa),
-- pero el snapshot de `pregunta` y el veredicto de `validacion_experta_campo`
-- no sabían a cuál de ellas pertenecía cada ítem, así que solo se podía
-- validar la ocupación principal.
--
-- Se agrega `cod_ocupacion` (código de la COPIA de la ocupación) a las dos
-- tablas. NULL significa "ocupación principal del instrumento": así los
-- snapshots y veredictos anteriores a esta migración siguen siendo válidos
-- sin reescribirlos.
--
-- Aditiva e idempotente. Sin BEGIN/COMMIT: el runner envuelve el archivo.
-- ============================================================================

ALTER TABLE clasificacion.pregunta
  ADD COLUMN IF NOT EXISTS cod_ocupacion TEXT NULL;

COMMENT ON COLUMN clasificacion.pregunta.cod_ocupacion IS
  'Copia de ocupación a la que pertenece el ítem del snapshot. NULL = ocupación principal del instrumento.';

CREATE INDEX IF NOT EXISTS ix_pregunta_instrumento_ocupacion
  ON clasificacion.pregunta (id_instrumento, cod_ocupacion);

ALTER TABLE clasificacion.validacion_experta_campo
  ADD COLUMN IF NOT EXISTS cod_ocupacion TEXT NULL;

COMMENT ON COLUMN clasificacion.validacion_experta_campo.cod_ocupacion IS
  'Copia de ocupación a la que pertenece el veredicto. NULL = ocupación principal del instrumento.';

CREATE INDEX IF NOT EXISTS ix_validacion_experta_campo_ocupacion
  ON clasificacion.validacion_experta_campo (id_validacion, cod_ocupacion);
