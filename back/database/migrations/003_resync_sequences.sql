-- ============================================================
--  003_resync_sequences
--
--  Los catálogos CNO/CUOC se cargaron en su día con IDs explícitos (dump /
--  import masivo) sin avanzar las secuencias SERIAL. Resultado: la primera
--  vez que el código deja que Postgres autogenere un id (p.ej.
--  copiarConocimientosCno -> INSERT en cno_conocimiento), nextval() devuelve
--  un valor ya usado y salta:
--    duplicate key value violates unique constraint "cno_conocimiento_pkey"
--
--  Esta migración recorre TODAS las columnas con secuencia asociada del
--  esquema y las reposiciona a MAX(columna). Idempotente y barata: correrla
--  de nuevo simplemente vuelve a fijar el mismo valor.
-- ============================================================

SET search_path TO clasificacion;

DO $$
DECLARE
  r   RECORD;
  seq TEXT;
  mx  BIGINT;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'clasificacion'
  LOOP
    seq := pg_get_serial_sequence('clasificacion.' || quote_ident(r.table_name), r.column_name);
    IF seq IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM clasificacion.%I', r.column_name, r.table_name)
      INTO mx;

    IF mx > 0 THEN
      EXECUTE format('SELECT setval(%L, %s, true)', seq, mx);
    ELSE
      EXECUTE format('SELECT setval(%L, 1, false)', seq);
    END IF;

    RAISE NOTICE 'secuencia % -> MAX(%.%) = %', seq, r.table_name, r.column_name, mx;
  END LOOP;
END $$;
