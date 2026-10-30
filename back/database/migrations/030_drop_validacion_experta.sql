-- ============================================================================
-- 030 · Se eliminan validacion_experta y validacion_experta_campo
-- ============================================================================
--
-- Hacían el mismo trabajo que `respuestas` + `pregunta_respuesta`; la 029
-- copió sus veredictos allí. Antes de borrar se comprueba que no quede
-- ninguno sin copiar: si falta alguno se aborta y no se pierde nada.
--
-- Idempotente. Sin BEGIN/COMMIT: el runner envuelve el archivo.
-- ============================================================================

SET search_path TO clasificacion;

DO $$
DECLARE
  faltan INTEGER;
BEGIN
  IF to_regclass('clasificacion.validacion_experta') IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO faltan
  FROM clasificacion.validacion_experta ve
  WHERE NOT EXISTS (
    SELECT 1 FROM clasificacion.respuestas r
    WHERE r.id_instrumento = ve.id_instrumento AND r.idusuario = ve.idusuario
      AND (
        SELECT count(*) FROM clasificacion.pregunta_respuesta pr WHERE pr.idrespuesta = r.idrespuesta
      ) = (
        SELECT count(*) FROM clasificacion.validacion_experta_campo c WHERE c.id_validacion = ve.id_validacion
      )
  );

  IF faltan > 0 THEN
    RAISE EXCEPTION '% veredicto(s) de validacion_experta no están en respuestas: no se borra nada', faltan;
  END IF;

  DROP TABLE clasificacion.validacion_experta_campo;
  DROP TABLE clasificacion.validacion_experta;
END $$;
