-- ============================================================
--  004_usuarios_prueba
--
--  Normaliza las cuentas de prueba en las BD que YA están desplegadas (una BD
--  nueva no pasa por aquí: la siembra de arranque, SeedService, las crea con
--  estos mismos datos).
--
--  Qué hace:
--   1. Da de baja dos cuentas heredadas que ya no encajan en el esquema de
--      pruebas: `sistema` y la cuenta de cédula `1193847562`.
--      `sistema` existía como fallback del módulo de Análisis cuando no había
--      JWT; hoy AnalisisController saca siempre el idUsuario del token
--      (analisis.controller.ts), así que ningún flujo la necesita.
--      OJO: si en algún entorno esas cuentas ya firmaron instrumentos o
--      respuestas, borrarlas rompería las FK (todas son NO ACTION). Por eso el
--      bloque comprueba antes: si hay registros asociados las DESACTIVA
--      (estado=0, no pueden iniciar sesión) en vez de borrarlas, y avisa.
--   2. Rellena nombre / apellido / correo de las cuentas de prueba restantes:
--      el nombre es el rol, el apellido "Sena" y el correo el mismo
--      identificador con el que se inicia sesión (columna `usuario`).
--   3. Crea el índice único que faltaba sobre `usuario.usuario`. AuthService
--      resuelve el login con findOne({ where: { usuario } }), así que dos filas
--      con el mismo identificador harían el inicio de sesión ambiguo; además es
--      lo que permite que SeedService siembre sin condiciones de carrera.
--
--  Idempotente: los pasos filtran por valor y el índice usa IF NOT EXISTS.
-- ============================================================

SET search_path TO clasificacion;

-- ── 1. Baja de cuentas heredadas ────────────────────────────
DO $$
DECLARE
  u    RECORD;
  refs INT;
BEGIN
  FOR u IN
    SELECT idusuario, usuario
    FROM clasificacion.usuario
    WHERE usuario IN ('sistema', '1193847562')
  LOOP
    SELECT (SELECT count(*) FROM clasificacion.instrumento        WHERE idusuario         = u.idusuario)
         + (SELECT count(*) FROM clasificacion.pregunta_respuesta WHERE idusuario         = u.idusuario)
         + (SELECT count(*) FROM clasificacion.respuestas         WHERE idusuario         = u.idusuario)
         + (SELECT count(*) FROM clasificacion.respuestas_copy1   WHERE usuario_idusuario = u.idusuario)
      INTO refs;

    IF refs = 0 THEN
      DELETE FROM clasificacion.usuario_roles WHERE idusuario = u.idusuario;
      DELETE FROM clasificacion.usuario       WHERE idusuario = u.idusuario;
      RAISE NOTICE 'usuario "%" (id %) eliminado', u.usuario, u.idusuario;
    ELSE
      UPDATE clasificacion.usuario SET estado = 0 WHERE idusuario = u.idusuario;
      RAISE NOTICE 'usuario "%" (id %) tiene % registro(s) asociado(s): se desactiva en vez de borrarse',
        u.usuario, u.idusuario, refs;
    END IF;
  END LOOP;
END $$;

-- ── 2. Nombre = rol, apellido = Sena, correo = identificador de login ──
UPDATE clasificacion.usuario u
SET nombre   = s.nombre,
    apellido = s.apellido,
    correo   = u.usuario
FROM (VALUES
  ('admin@sena.edu.co',           'Administrador', 'Sena'),
  ('prueba.analista@sena.edu.co', 'Analista',      'Sena'),
  ('experto@sena.edu.co',         'Experto',       'Sena'),
  ('ciudadano@sena.edu.co',       'Ciudadano',     'Sena'),
  ('ape@sena.edu.co',             'Ape',           'Sena'),
  ('tendencias@sena.edu.co',      'Tendencias',    'Ocupaciones')
) AS s(usuario, nombre, apellido)
WHERE u.usuario = s.usuario;

-- ── 3. Unicidad del identificador de login ──────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_usuario
  ON clasificacion.usuario (usuario);
