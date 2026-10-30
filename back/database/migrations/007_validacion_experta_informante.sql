-- ============================================================
--  007_validacion_experta_informante
--
--  Añade a `validacion_experta` los datos generales del informante que el
--  experto diligencia durante la revisión (nombre, correo, teléfono,
--  departamento, municipio, empresa, cargo y profesión).
--
--  Por qué: esos campos existían en el formulario, pero no se guardaban en
--  ninguna parte. En el frontend los inputs estaban enlazados con `[value]`
--  —vinculación de un solo sentido, sin formControlName ni (input)—, así que
--  lo que el experto escribía no llegaba a ningún modelo; y aunque hubiera
--  llegado, la tabla no tenía columnas donde ponerlo. Al reabrir el modal los
--  campos volvían vacíos.
--
--  Van en la cabecera y no en `validacion_experta_campo` porque describen al
--  informante de la validación completa, no el veredicto de un campo.
--
--  Idempotente y aditivo: ADD COLUMN IF NOT EXISTS, todas anulables, ninguna
--  fila existente se ve afectada. NO lleva BEGIN/COMMIT: el runner
--  (scripts/db-migrate.js) envuelve cada archivo en su propia transacción.
-- ============================================================

SET search_path TO clasificacion;

ALTER TABLE clasificacion.validacion_experta
  ADD COLUMN IF NOT EXISTS informante_nombre        TEXT        NULL,
  ADD COLUMN IF NOT EXISTS informante_email         TEXT        NULL,
  ADD COLUMN IF NOT EXISTS informante_telefono      VARCHAR(45) NULL,
  -- Geografía como texto: el formulario resuelve departamento y municipio con
  -- las constantes del frontend, no contra las tablas `departamento`/`ciudad`
  -- (que están vacías). Guardar el código rompería la FK.
  ADD COLUMN IF NOT EXISTS informante_departamento  TEXT        NULL,
  ADD COLUMN IF NOT EXISTS informante_municipio     TEXT        NULL,
  ADD COLUMN IF NOT EXISTS informante_empresa       TEXT        NULL,
  ADD COLUMN IF NOT EXISTS informante_cargo         TEXT        NULL,
  ADD COLUMN IF NOT EXISTS informante_profesion     TEXT        NULL;
