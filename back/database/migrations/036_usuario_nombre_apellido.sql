-- ============================================================
--  036_usuario_nombre_apellido
--
--  `usuario` vuelve a guardar el nombre en una sola columna, nombre_apellido
--  TEXT, como estaba en el esquema original (documentos/clasificacionpsql.sql).
--  Las columnas nombre y apellido se unen en ella ("Nombre Apellido") y se
--  borran.
--
--  Sirve también para una BD nueva: init/01-schema.sql ya crea
--  nombre_apellido, pero 003b y 004 vuelven a añadir y llenar nombre/apellido
--  antes de que llegue esta; aquí se unen y se borran igual.
--
--  Usuarios existentes (local y despliegue): no pierden nada ni tienen que
--  hacer nada. Su nombre queda "Nombre Apellido" (si falta una parte, solo la
--  otra; si faltan las dos, NULL). No se tocan contraseñas, roles, cédulas,
--  sesiones ni asignaciones: todo eso va por idusuario.
--
--  Respaldo: antes de borrar las columnas, los valores originales se copian a
--  clasificacion._respaldo_usuario_nombre_036 (idusuario, nombre, apellido).
--  Con eso se puede revertir sin restaurar toda la BD. Cuando el cambio esté
--  confirmado en producción, la tabla se puede borrar a mano.
--
--  Idempotente: si nombre/apellido ya no existen no hace nada.
--  NO lleva BEGIN/COMMIT: el runner (scripts/db-migrate.js) envuelve cada
--  archivo en su propia transacción.
-- ============================================================

SET search_path TO clasificacion;

ALTER TABLE clasificacion.usuario
  ADD COLUMN IF NOT EXISTS nombre_apellido TEXT NULL DEFAULT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'clasificacion' AND table_name = 'usuario' AND column_name = 'nombre'
  ) THEN
    CREATE TABLE IF NOT EXISTS clasificacion._respaldo_usuario_nombre_036 (
      idusuario INT PRIMARY KEY,
      nombre    VARCHAR(100),
      apellido  VARCHAR(100),
      respaldado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO clasificacion._respaldo_usuario_nombre_036 (idusuario, nombre, apellido)
    SELECT idusuario, nombre, apellido FROM clasificacion.usuario
    ON CONFLICT (idusuario) DO NOTHING;

    -- concat_ws omite los NULL; NULLIF deja NULL si no había ni nombre ni apellido.
    UPDATE clasificacion.usuario
    SET nombre_apellido = NULLIF(TRIM(concat_ws(' ', NULLIF(TRIM(nombre), ''), NULLIF(TRIM(apellido), ''))), '')
    WHERE nombre_apellido IS NULL;

    ALTER TABLE clasificacion.usuario DROP COLUMN nombre;
  END IF;

  ALTER TABLE clasificacion.usuario DROP COLUMN IF EXISTS apellido;
END $$;
