-- ============================================================================
-- 027 · Campos de `respuestas` alineados con clasificacionpsql.sql
-- ============================================================================
--
-- - nombre_apellido, empresa_entidad, cargo, profesión: de VARCHAR a TEXT,
--   como en el script (VARCHAR(45) cortaba empresas y cargos largos).
-- - departamento / municipio: siguen como texto con la clave del catálogo del
--   frontend (migración 025), pero NOT NULL, igual que departamento_codigo /
--   ciudad_codigo en el script.
-- - Se retiran `nombre` y `apellido`, que quedaron vacíos y sin uso tras
--   volver a `nombre_apellido` (migración 026).
--
-- La tabla no tenía información real. Si alguna fila no tiene departamento o
-- municipio, la migración aborta en vez de inventar el dato.
--
-- Idempotente: sobre una BD creada desde 01-schema.sql es no-op. Sin
-- BEGIN/COMMIT: el runner envuelve el archivo.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clasificacion.respuestas
    WHERE departamento IS NULL OR municipio IS NULL
  ) THEN
    RAISE EXCEPTION 'respuestas tiene filas sin departamento o municipio: complétalas antes de aplicar 027';
  END IF;
END $$;

ALTER TABLE clasificacion.respuestas
  ALTER COLUMN nombre_apellido TYPE TEXT,
  ALTER COLUMN empresa_entidad TYPE TEXT,
  ALTER COLUMN cargo TYPE TEXT,
  ALTER COLUMN "profesión" TYPE TEXT,
  ALTER COLUMN departamento SET NOT NULL,
  ALTER COLUMN municipio SET NOT NULL,
  DROP COLUMN IF EXISTS nombre,
  DROP COLUMN IF EXISTS apellido;
