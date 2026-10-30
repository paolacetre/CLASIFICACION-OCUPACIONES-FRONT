-- ============================================================================
-- 026 · `respuestas.nombre_apellido` vuelve a ser un solo campo
-- ============================================================================
--
-- Una versión previa de 025 separó `nombre_apellido` en `nombre` y `apellido`.
-- Se decidió dejarlo junto, como en back/documentos/clasificacionpsql.sql, y
-- esa parte ya se quitó de 025. Esta migración repara las BD donde sí corrió.
--
-- No borra nada: vuelve a crear `nombre_apellido`, copia ahí lo que hubiera en
-- `nombre`/`apellido` y deja esas dos columnas intactas (el código ya no las
-- usa). Retirarlas queda para una migración aparte, cuando se decida.
--
-- Idempotente: sobre una BD creada desde 01-schema.sql es no-op. Sin
-- BEGIN/COMMIT: el runner envuelve el archivo.
-- ============================================================================

ALTER TABLE clasificacion.respuestas
  ADD COLUMN IF NOT EXISTS nombre_apellido VARCHAR(120) NULL DEFAULT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'clasificacion' AND table_name = 'respuestas'
      AND column_name = 'apellido'
  ) THEN
    UPDATE clasificacion.respuestas
       SET nombre_apellido = NULLIF(concat_ws(' ', nombre, apellido), '')
     WHERE nombre_apellido IS NULL;
  END IF;
END $$;
