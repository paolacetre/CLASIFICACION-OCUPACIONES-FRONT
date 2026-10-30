-- ============================================================================
-- 025 · Sin tablas de departamento/ciudad y seriales en los catálogos de
--       conocimientos y habilidades
-- ============================================================================
--
-- 1. Departamento y ciudad salen de la BD.
--    Los departamentos y municipios vienen del catálogo del frontend
--    (DEPARTAMENTOS / MUNICIPIOS_POR_DEPARTAMENTO) y se guardan como texto,
--    igual que ya hacen instrumento3_propuesta (departamento, municipio) y
--    validacion_experta (informante_departamento, informante_municipio).
--    Las tablas `departamento` y `ciudad` estaban vacías y solo las
--    referenciaban `respuestas` y `respuestas_copy1` con enteros + FK. Esas
--    columnas se cambian por `departamento` / `municipio` TEXT y se borran
--    las dos tablas.
--
-- 2. `cno_conocimiento.cod_conocimiento` y `habilidad_destreza.cod_hab_dest`
--    vuelven a tener secuencia. La plantilla de carga sigue trayendo el código
--    del catálogo (las hojas de relación lo usan para enlazar), así que un
--    INSERT con código explícito lo respeta; uno sin código lo toma de la
--    secuencia. La secuencia se deja en MAX + 1 y el backend la reposiciona
--    después de cada carga o alta manual (resincronizarSecuencia), para que
--    no vuelva a quedarse atrás como en el incidente de 003_resync_sequences.
--
-- Idempotente: sobre una BD creada desde 01-schema.sql es no-op. Sin
-- BEGIN/COMMIT: el runner envuelve el archivo.
-- ============================================================================

SET search_path TO clasificacion;

-- ── 1. Departamento / municipio como texto ──────────────────────────────────

ALTER TABLE clasificacion.respuestas
  DROP CONSTRAINT IF EXISTS fk_respuestas_departamento1,
  DROP CONSTRAINT IF EXISTS fk_respuestas_ciudad1,
  DROP COLUMN IF EXISTS departamento_codigo,
  DROP COLUMN IF EXISTS ciudad_codigo,
  ADD COLUMN IF NOT EXISTS departamento TEXT NULL,
  ADD COLUMN IF NOT EXISTS municipio TEXT NULL;

ALTER TABLE clasificacion.respuestas_copy1
  DROP CONSTRAINT IF EXISTS fk_respuestas_copy1_departamento1,
  DROP CONSTRAINT IF EXISTS fk_respuestas_copy1_ciudad1,
  DROP COLUMN IF EXISTS departamento_codigo,
  DROP COLUMN IF EXISTS ciudad_codigo,
  ADD COLUMN IF NOT EXISTS departamento TEXT NULL,
  ADD COLUMN IF NOT EXISTS municipio TEXT NULL;

DROP TABLE IF EXISTS clasificacion.ciudad;
DROP TABLE IF EXISTS clasificacion.departamento;

-- ── 2. Seriales en los catálogos cargados desde Excel ───────────────────────

CREATE SEQUENCE IF NOT EXISTS clasificacion.cno_conocimiento_cod_conocimiento_seq
  AS INTEGER OWNED BY clasificacion.cno_conocimiento.cod_conocimiento;
ALTER TABLE clasificacion.cno_conocimiento
  ALTER COLUMN cod_conocimiento
  SET DEFAULT nextval('clasificacion.cno_conocimiento_cod_conocimiento_seq');
SELECT setval(
  'clasificacion.cno_conocimiento_cod_conocimiento_seq',
  COALESCE((SELECT MAX(cod_conocimiento) FROM clasificacion.cno_conocimiento), 0) + 1,
  false
);

CREATE SEQUENCE IF NOT EXISTS clasificacion.habilidad_destreza_cod_hab_dest_seq
  AS INTEGER OWNED BY clasificacion.habilidad_destreza.cod_hab_dest;
ALTER TABLE clasificacion.habilidad_destreza
  ALTER COLUMN cod_hab_dest
  SET DEFAULT nextval('clasificacion.habilidad_destreza_cod_hab_dest_seq');
SELECT setval(
  'clasificacion.habilidad_destreza_cod_hab_dest_seq',
  COALESCE((SELECT MAX(cod_hab_dest) FROM clasificacion.habilidad_destreza), 0) + 1,
  false
);
