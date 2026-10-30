-- ============================================================================
-- 021 · Estado de las denominaciones CUOC
-- ============================================================================
--
-- La carga masiva CUOC insertaba las denominaciones sin la columna `estado`
-- (solo código, nombre, ocupación y fuente), y la columna no tenía DEFAULT.
-- Resultado: 5.746 de 14.721 denominaciones quedaron con estado NULL, y la
-- consulta y el export las mostraban como "Inactivo" (el servicio traduce
-- `estado === 1 ? 'Activo' : 'Inactivo'`).
--
-- NULL significa "nunca se cargó", no "dada de baja": en cuoc_denominacion no
-- existía ningún 0, y funciones y ocupaciones CUOC están todas en 1. Por eso
-- se rellenan como activas.
--
-- DEFAULT 1 + NOT NULL impide que vuelva a pasar: un INSERT que omita la
-- columna entra como activa, y uno que mande NULL explícito falla en vez de
-- dejar el dato ambiguo.
--
-- Idempotente: sobre una BD ya migrada o creada desde 01-schema.sql es no-op.
-- ============================================================================

UPDATE clasificacion.cuoc_denominacion SET estado = 1 WHERE estado IS NULL;

ALTER TABLE clasificacion.cuoc_denominacion ALTER COLUMN estado SET DEFAULT 1;
ALTER TABLE clasificacion.cuoc_denominacion ALTER COLUMN estado SET NOT NULL;
