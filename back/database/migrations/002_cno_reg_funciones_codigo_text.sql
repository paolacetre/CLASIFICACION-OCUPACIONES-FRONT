-- ============================================================
--  002_cno_reg_funciones_codigo_text
--
--  cno_reg_funciones.codigo debe ser TEXT (clave natural tomada de la hoja
--  "Funciones - C.N.O.", p.ej. "F-0011.01"; y en las copias de Análisis,
--  "<codOcupacion>-<comparativa>-F<n>"). En volúmenes viejos quedó como
--  integer/serial (import anterior), así que POST /api/analisis/guardar
--  reventaba con:
--    invalid input syntax for type integer: "0011-7-F1"
--
--  Idempotente: si ya es text, no hace nada. Los 4991 valores enteros
--  actuales se castean a su representación decimal sin colisión (siguen
--  siendo únicos). No hay FKs entrantes hacia esta columna.
-- ============================================================

SET search_path TO clasificacion;

DO $$
BEGIN
  IF (
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'clasificacion'
      AND table_name   = 'cno_reg_funciones'
      AND column_name  = 'codigo'
  ) = 'integer' THEN
    RAISE NOTICE 'Convirtiendo cno_reg_funciones.codigo a text';
    ALTER TABLE clasificacion.cno_reg_funciones ALTER COLUMN codigo DROP DEFAULT;
    ALTER TABLE clasificacion.cno_reg_funciones
      ALTER COLUMN codigo TYPE text USING codigo::text;
    DROP SEQUENCE IF EXISTS clasificacion.cno_reg_funciones_codigo_seq;
  END IF;
END $$;
