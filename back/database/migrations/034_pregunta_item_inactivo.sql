-- ============================================================================
-- 034 · Snapshot de validación: funciones y denominaciones inactivas
-- ============================================================================
--
-- Análisis muestra las funciones y denominaciones activas E inactivas, y la
-- copia que guarda conserva el estado de cada una. El snapshot que recibe el
-- experto (`pregunta`) solo guardaba el texto, así que un ítem dado de baja
-- le llegaba como si estuviera vigente.
--
-- `inactivo` marca el ítem del snapshot. FALSE por defecto: los snapshots
-- anteriores (y los campos que no son listas: nombre, descripción…) siguen
-- leyéndose como activos sin reescribirlos.
--
-- Aditiva e idempotente. Sin BEGIN/COMMIT: el runner envuelve el archivo.
-- ============================================================================

ALTER TABLE clasificacion.pregunta
  ADD COLUMN IF NOT EXISTS inactivo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN clasificacion.pregunta.inactivo IS
  'TRUE si la función o denominación estaba inactiva en la copia al congelar el snapshot.';
