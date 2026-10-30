-- ============================================================
--  019_correlativas_cno_cuoc.sql
--
--  Tablas correlativas CNO <-> CUOC para los 3 niveles:
--  1) clasificacion.correlativa_ocupacion (Nivel Ocupación)
--  2) clasificacion.correlativa_conocimiento (Nivel Conocimiento)
--  3) clasificacion.correlativa_denominacion (Nivel Denominación)
-- ============================================================

-- -----------------------------------------------------
-- 1. Table clasificacion.correlativa_ocupacion
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.correlativa_ocupacion CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.correlativa_ocupacion (
  codigo SERIAL NOT NULL,
  cno_ocupacion_cno TEXT NOT NULL,
  nomb_ocupacion_cno TEXT NULL,
  cuoc_ocupacion_cuoc TEXT NOT NULL,
  nomb_ocupacion_cuoc TEXT NULL,
  observacion TEXT NULL,
  PRIMARY KEY (codigo),
  CONSTRAINT fk_correlativa_ocupacion_cno_ocupacion1
    FOREIGN KEY (cno_ocupacion_cno)
    REFERENCES clasificacion.cno_ocupacion (cod_ocupacion_cno)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_correlativa_ocupacion_cuoc_ocupacion1
    FOREIGN KEY (cuoc_ocupacion_cuoc)
    REFERENCES clasificacion.cuoc_ocupacion (cod_ocupacion_cuoc)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_correlativa_ocupacion_cno
  ON clasificacion.correlativa_ocupacion (cno_ocupacion_cno);

CREATE INDEX IF NOT EXISTS idx_correlativa_ocupacion_cuoc
  ON clasificacion.correlativa_ocupacion (cuoc_ocupacion_cuoc);


-- -----------------------------------------------------
-- 2. Table clasificacion.correlativa_conocimiento
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.correlativa_conocimiento CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.correlativa_conocimiento (
  codigo SERIAL NOT NULL,
  cod_conocimiento_cno INT NOT NULL,
  nomb_conocimiento_cno TEXT NULL,
  cod_conocimiento_cuoc INT NOT NULL,
  nomb_conocimiento_cuoc TEXT NULL,
  aplica_correl_conocimientos SMALLINT NULL DEFAULT 0,
  PRIMARY KEY (codigo),
  CONSTRAINT fk_correlativa_conocimiento_cno_conocimiento1
    FOREIGN KEY (cod_conocimiento_cno)
    REFERENCES clasificacion.cno_conocimiento (cod_conocimiento)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_correlativa_conocimiento_cuoc_conocimiento1
    FOREIGN KEY (cod_conocimiento_cuoc)
    REFERENCES clasificacion.cuoc_conocimiento (cod_conocimiento)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_correlativa_conocimiento_cno
  ON clasificacion.correlativa_conocimiento (cod_conocimiento_cno);

CREATE INDEX IF NOT EXISTS idx_correlativa_conocimiento_cuoc
  ON clasificacion.correlativa_conocimiento (cod_conocimiento_cuoc);


-- -----------------------------------------------------
-- 3. Table clasificacion.correlativa_denominacion
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS clasificacion.correlativa_denominacion (
  codigo SERIAL NOT NULL,
  cod_ocupacion_cno TEXT NOT NULL,
  cod_denominacion_cno TEXT NOT NULL,
  desc_denominacion_cno TEXT NULL,
  cod_denominacion_cuoc TEXT NOT NULL,
  cod_ocupacion_cuoc TEXT NOT NULL,
  desc_denominacion_cuoc TEXT NULL,
  estado BOOLEAN NULL DEFAULT NULL,
  observacion TEXT NULL,
  PRIMARY KEY (codigo),
  CONSTRAINT fk_correlativa_denom_cno_denominacion
    FOREIGN KEY (cod_denominacion_cno)
    REFERENCES clasificacion.cno_denominacion (cod_denominacion_cno)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_correlativa_denom_cuoc_denominacion
    FOREIGN KEY (cod_denominacion_cuoc)
    REFERENCES clasificacion.cuoc_denominacion (cod_denominacion)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cno_ocup
  ON clasificacion.correlativa_denominacion (cod_ocupacion_cno);

CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cno_denom
  ON clasificacion.correlativa_denominacion (cod_denominacion_cno);

CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cuoc_ocup
  ON clasificacion.correlativa_denominacion (cod_ocupacion_cuoc);

CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cuoc_denom
  ON clasificacion.correlativa_denominacion (cod_denominacion_cuoc);

-- Poblar clasificacion.correlativa_denominacion desde clasificacion.correlativa si existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'clasificacion' AND table_name = 'correlativa') THEN
    INSERT INTO clasificacion.correlativa_denominacion (
      codigo, cod_ocupacion_cno, cod_denominacion_cno, desc_denominacion_cno,
      cod_denominacion_cuoc, cod_ocupacion_cuoc, desc_denominacion_cuoc, estado, observacion
    )
    SELECT 
      codigo, cod_ocupacion_cno, cod_denominacion_cno, desc_denominacion_cno,
      cod_denominacion_cuoc, cod_ocupacion_cuoc, desc_denominacion_cuoc, estado, observacion
    FROM clasificacion.correlativa
    ON CONFLICT (codigo) DO NOTHING;

    PERFORM setval(
      pg_get_serial_sequence('clasificacion.correlativa_denominacion', 'codigo'),
      COALESCE((SELECT MAX(codigo) FROM clasificacion.correlativa_denominacion), 1)
    );
  END IF;
END $$;
