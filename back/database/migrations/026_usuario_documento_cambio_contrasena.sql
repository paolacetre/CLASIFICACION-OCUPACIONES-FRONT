-- ============================================================================
-- 026 · Cédula del usuario y cambio de contraseña obligatorio
-- ============================================================================
--
-- La importación de usuarios en lote asignaba la contraseña fija '123456' a
-- toda fila que no la trajera: cualquiera que conociera ese valor entraba con
-- la cuenta importada. Ahora, si la fila no trae contraseña, la contraseña
-- inicial es la cédula de la persona y la cuenta queda marcada para que la
-- cambie en su primer ingreso; mientras no lo haga, el backend no le deja usar
-- nada más que el cambio de contraseña.
--
-- `documento` es además un identificador de inicio de sesión (el login ya
-- pedía "Correo SENA o Documento"), por eso es único cuando viene.
--
-- Idempotente: se puede volver a ejecutar sin efecto.
-- ============================================================================

ALTER TABLE clasificacion.usuario
  ADD COLUMN IF NOT EXISTS documento VARCHAR(20) NULL;

ALTER TABLE clasificacion.usuario
  ADD COLUMN IF NOT EXISTS debe_cambiar_contrasena BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS usuario_documento_uk
  ON clasificacion.usuario (documento)
  WHERE documento IS NOT NULL;

COMMENT ON COLUMN clasificacion.usuario.documento IS
  'Cédula (solo dígitos). Sirve para iniciar sesión y es la contraseña inicial de los usuarios importados sin contraseña.';
COMMENT ON COLUMN clasificacion.usuario.debe_cambiar_contrasena IS
  'true = la contraseña actual es temporal (la cédula); el usuario debe cambiarla antes de usar el sistema.';
