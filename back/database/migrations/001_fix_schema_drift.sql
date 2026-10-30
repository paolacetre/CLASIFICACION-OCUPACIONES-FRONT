-- ============================================================
--  001_fix_schema_drift
--
--  Alinea una BD que quedó por detrás de back/database/init/01-schema.sql
--  (código a 2026-09-03). El volumen api-clasificacion_pgdata se creó desde
--  un dump anterior al commit 4c572f0 (2026-08-12) y nunca se migró, así que
--  las entidades TypeORM (synchronize=false) pedían columnas/tablas
--  inexistentes y TODOS los endpoints de datos respondían 500
--  ("column CnoOcupacion.campo_ocup_cno does not exist").
--
--  Idempotente: se puede correr sobre una BD ya alineada (recreada desde
--  01-schema.sql) y no hace nada. NO lleva BEGIN/COMMIT: el runner
--  (scripts/db-migrate.js) envuelve cada archivo en su propia transacción.
--
--  Si una tabla vacía tiene estructura antigua se recrea. Si tuviera datos
--  con estructura antigua, aborta y pide migración manual (no debería pasar:
--  instrumento/respuestas/comparativa_ocupacion nacen vacías).
-- ============================================================

SET search_path TO clasificacion;

-- ── 1. Columnas nuevas en tablas con datos (no destructivo) ──
ALTER TABLE clasificacion.cno_ocupacion
  ADD COLUMN IF NOT EXISTS campo_ocup_cno          TEXT NULL,
  ADD COLUMN IF NOT EXISTS cod_ante_ocupacion_cno  TEXT NULL,
  ADD COLUMN IF NOT EXISTS id_comparativa          INT  NULL;

ALTER TABLE clasificacion.cuoc_ocupacion
  ADD COLUMN IF NOT EXISTS cod_ante_ocupacion_cuoc TEXT NULL,
  ADD COLUMN IF NOT EXISTS id_comparativa          INT  NULL;

ALTER TABLE clasificacion.cuoc_denominacion
  ADD COLUMN IF NOT EXISTS observacion TEXT NULL;

-- ── 2. Tablas vacías con estructura antigua: se descartan ────
--    (el CREATE ... IF NOT EXISTS de la sección 3 las reconstruye)
DO $$
DECLARE
  drift RECORD;
  n     BIGINT;
BEGIN
  FOR drift IN
    SELECT * FROM (VALUES
      ('comparativa_ocupacion', 'cod_ocupacion_cno2'),
      ('instrumento',           'idusuario'),
      ('respuestas',            'nombre_ocupacion')
    ) AS t(tabla, columna_esperada)
  LOOP
    IF to_regclass('clasificacion.' || drift.tabla) IS NULL THEN
      CONTINUE;  -- no existe: la crea la sección 3
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'clasificacion'
        AND table_name   = drift.tabla
        AND column_name  = drift.columna_esperada
    ) THEN
      CONTINUE;  -- ya está alineada
    END IF;

    EXECUTE format('SELECT count(*) FROM clasificacion.%I', drift.tabla) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION
        'Tabla %.% tiene % filas con estructura antigua (falta "%"). Migración manual requerida.',
        'clasificacion', drift.tabla, n, drift.columna_esperada;
    END IF;

    RAISE NOTICE 'Recreando tabla vacía con estructura antigua: %', drift.tabla;
    EXECUTE format('DROP TABLE clasificacion.%I CASCADE', drift.tabla);
  END LOOP;
END $$;

-- ── 3. (Re)creación de tablas ausentes o recién descartadas ──
--    Definición tomada textualmente de init/01-schema.sql.

CREATE TABLE IF NOT EXISTS clasificacion.comparativa_ocupacion (
  codigo SERIAL NOT NULL,
  descripcion TEXT NULL DEFAULT NULL,
  estado TEXT NULL DEFAULT NULL,
  fecha_registro DATE NULL DEFAULT NULL,
  id_usuario INT NOT NULL,
  cod_ocupacion_cno TEXT NULL,
  cod_ocupacion_cno2 TEXT NULL,
  cod_ocupacion_cno3 TEXT NULL,
  cod_ocupacion_cuoc TEXT NULL,
  cod_ocupacion_cuoc2 TEXT NULL,
  cod_ocupacion_cuoc3 TEXT NULL,
  PRIMARY KEY (codigo),
  CONSTRAINT fk_comp_ocup_cno
    FOREIGN KEY (cod_ocupacion_cno)
    REFERENCES clasificacion.cno_ocupacion (cod_ocupacion_cno),
  CONSTRAINT fk_comp_cuoc_ocup
    FOREIGN KEY (cod_ocupacion_cuoc)
    REFERENCES clasificacion.cuoc_ocupacion (cod_ocupacion_cuoc)
);

CREATE TABLE IF NOT EXISTS clasificacion.instrumento (
  idinstrumento SERIAL PRIMARY KEY,
  tipo TEXT NULL DEFAULT NULL,
  ocupacion TEXT NOT NULL,
  idusuario INT NOT NULL,
  fecha TIMESTAMP NULL DEFAULT NULL,
  estado VARCHAR(45) NULL DEFAULT NULL,
  observacion TEXT NULL DEFAULT NULL,
  comparativa_ocupacion_id INT NOT NULL,
  CONSTRAINT fk_instrumento_comparativa_ocupacion1
    FOREIGN KEY (comparativa_ocupacion_id)
    REFERENCES clasificacion.comparativa_ocupacion (codigo),
  CONSTRAINT fk_inst_usuario
    FOREIGN KEY (idusuario)
    REFERENCES clasificacion.usuario (idusuario)
);

CREATE TABLE IF NOT EXISTS clasificacion.respuestas (
  IdRespuesta SERIAL PRIMARY KEY,
  idusuario INT NOT NULL,
  nombre_apellido VARCHAR(120) NULL DEFAULT NULL,
  telefono VARCHAR(45) NULL DEFAULT NULL,
  email TEXT NULL DEFAULT NULL,
  departamento_codigo INT NOT NULL,
  ciudad_codigo INT NOT NULL,
  empresa_entidad VARCHAR(45) NULL DEFAULT NULL,
  cargo VARCHAR(45) NULL DEFAULT NULL,
  profesión VARCHAR(45) NULL DEFAULT NULL,
  sector_codigo INT NOT NULL,
  nombre_ocupacion TEXT NULL,
  descripcion TEXT NULL,
  CONSTRAINT fk_respuestas_ciudad1
    FOREIGN KEY (ciudad_codigo) REFERENCES clasificacion.ciudad (codigo),
  CONSTRAINT fk_respuestas_departamento1
    FOREIGN KEY (departamento_codigo) REFERENCES clasificacion.departamento (codigo),
  CONSTRAINT fk_respuestas_sector1
    FOREIGN KEY (sector_codigo) REFERENCES clasificacion.sector (codigo),
  CONSTRAINT fk_respuestas_usuario1
    FOREIGN KEY (idusuario) REFERENCES clasificacion.usuario (idusuario)
);

CREATE TABLE IF NOT EXISTS clasificacion.pregunta (
  id_pregunta SERIAL NOT NULL,
  id_instrumento INT NOT NULL,
  identificador TEXT NULL,
  detalle TEXT NULL DEFAULT NULL,
  otro TEXT NULL,
  PRIMARY KEY (id_pregunta),
  CONSTRAINT fk_pregunta_instrumento1
    FOREIGN KEY (id_instrumento)
    REFERENCES clasificacion.instrumento (idinstrumento)
);

CREATE TABLE IF NOT EXISTS clasificacion.pregunta_respuesta (
  id INT NOT NULL,
  idusuario INT NOT NULL,
  idRespuesta INT NOT NULL,
  id_pregunta INT NOT NULL,
  respuesta TEXT NULL,
  otro TEXT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_respuestas_pregunta
    FOREIGN KEY (id_pregunta) REFERENCES clasificacion.pregunta (id_pregunta),
  CONSTRAINT fk_pregunta_respuesta_usuario1
    FOREIGN KEY (idusuario) REFERENCES clasificacion.usuario (idusuario),
  CONSTRAINT fk_pregunta_respuesta_respuestas
    FOREIGN KEY (idRespuesta) REFERENCES clasificacion.respuestas (IdRespuesta)
);

CREATE TABLE IF NOT EXISTS clasificacion.respuestas_copy1 (
  IdRespuesta SERIAL PRIMARY KEY,
  usuario_idusuario INT NOT NULL,
  detalle TEXT NULL DEFAULT NULL,
  respuestascol VARCHAR(45) NULL DEFAULT NULL,
  nombre_apellido VARCHAR(120) NULL DEFAULT NULL,
  email TEXT NULL DEFAULT NULL,
  instrumento_idinstrumento INT NOT NULL,
  telefono VARCHAR(45) NULL DEFAULT NULL,
  departamento_codigo INT NOT NULL,
  ciudad_codigo INT NOT NULL,
  empresa_entidad VARCHAR(45) NULL DEFAULT NULL,
  cargo VARCHAR(45) NULL DEFAULT NULL,
  profesión VARCHAR(45) NULL DEFAULT NULL,
  sector_codigo INT NOT NULL,
  nombre TEXT NULL,
  descripcion TEXT NULL,
  area TEXT NULL,
  nivel_cualificacion TEXT NULL,
  f1 TEXT NULL, f2 TEXT NULL, f3 TEXT NULL, f4 TEXT NULL, f5 TEXT NULL,
  f6 TEXT NULL, f7 TEXT NULL, f8 TEXT NULL, f9 TEXT NULL, f10 TEXT NULL,
  f11 TEXT NULL, f12 TEXT NULL, f13 TEXT NULL, f14 TEXT NULL, f15 TEXT NULL,
  f16 TEXT NULL, f17 TEXT NULL, f18 TEXT NULL, f19 TEXT NULL, f20 TEXT NULL,
  d1 TEXT NULL, d2 TEXT NULL, d3 TEXT NULL, d4 TEXT NULL, d5 TEXT NULL,
  d6 TEXT NULL, d7 TEXT NULL, d8 TEXT NULL, d9 TEXT NULL, d10 TEXT NULL,
  d11 TEXT NULL, d12 TEXT NULL, d13 TEXT NULL, d14 TEXT NULL, d15 TEXT NULL,
  d16 TEXT NULL, d17 TEXT NULL, d18 TEXT NULL, d19 TEXT NULL, d20 TEXT NULL,
  r1 TEXT NULL, r2 TEXT NULL, r3 TEXT NULL, r4 TEXT NULL, r5 TEXT NULL,
  r6 TEXT NULL, r7 TEXT NULL, r8 TEXT NULL, r9 TEXT NULL, r10 TEXT NULL,
  r11 TEXT NULL, r12 TEXT NULL, r13 TEXT NULL, r14 TEXT NULL, r15 TEXT NULL,
  r16 TEXT NULL, r17 TEXT NULL, r18 TEXT NULL, r19 VARCHAR(45) NULL, r20 TEXT NULL,
  h1 TEXT NULL, h2 TEXT NULL, h3 TEXT NULL, h4 TEXT NULL, h5 TEXT NULL,
  h6 TEXT NULL, h7 TEXT NULL, h8 TEXT NULL, h9 TEXT NULL, h10 TEXT NULL,
  h11 TEXT NULL, h12 TEXT NULL, h13 TEXT NULL, h14 TEXT NULL, h15 TEXT NULL,
  h16 TEXT NULL, h17 TEXT NULL, h18 TEXT NULL, h19 TEXT NULL, h20 TEXT NULL,
  c1 TEXT NULL, c2 TEXT NULL, c3 TEXT NULL, c4 TEXT NULL, c5 TEXT NULL,
  c6 TEXT NULL, c7 TEXT NULL, c8 TEXT NULL, c9 TEXT NULL, c10 TEXT NULL,
  CONSTRAINT fk_respuestas_copy1_ciudad1
    FOREIGN KEY (ciudad_codigo) REFERENCES clasificacion.ciudad (codigo),
  CONSTRAINT fk_respuestas_copy1_departamento1
    FOREIGN KEY (departamento_codigo) REFERENCES clasificacion.departamento (codigo),
  CONSTRAINT fk_respuestas_copy1_instrumento1
    FOREIGN KEY (instrumento_idinstrumento) REFERENCES clasificacion.instrumento (idinstrumento),
  CONSTRAINT fk_respuestas_copy1_sector1
    FOREIGN KEY (sector_codigo) REFERENCES clasificacion.sector (codigo),
  CONSTRAINT fk_respuestas_copy1_usuario1
    FOREIGN KEY (usuario_idusuario) REFERENCES clasificacion.usuario (idusuario)
);
