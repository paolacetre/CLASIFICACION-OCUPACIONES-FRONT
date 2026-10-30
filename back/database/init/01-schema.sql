
-- -----------------------------------------------------
-- Schema clasificacion
-- -----------------------------------------------------
-- Fuente de verdad: back/documentos/clasificacion.sql
-- Se recrea el schema completo (DROP CASCADE) para garantizar que la
-- estructura final coincide exactamente con ese script.
DROP SCHEMA IF EXISTS clasificacion CASCADE;
CREATE SCHEMA IF NOT EXISTS clasificacion;
-- Búsqueda sin tildes (ver migración 022).
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
SET search_path TO clasificacion;

-- Sin tablas departamento/ciudad: departamentos y municipios salen del catalogo
-- del frontend y se guardan como texto (ver migracion 025).

-- -----------------------------------------------------
-- Table clasificacion.cno_area_desempeno
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cno_area_desempeno CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cno_area_desempeno (
  cod_desempeno TEXT NOT NULL,
  nom_desempeno TEXT NULL DEFAULT NULL,
  descripcion TEXT NULL DEFAULT NULL,
  PRIMARY KEY (cod_desempeno)
);

-- -----------------------------------------------------
-- Table clasificacion.cno_conocimiento
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cno_conocimiento CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cno_conocimiento (
  -- SERIAL (migracion 025): la plantilla de Excel trae el codigo del catalogo y se
  -- respeta; sin codigo, lo asigna la secuencia. Un INSERT con codigo explicito no
  -- avanza la secuencia, asi que el backend la reposiciona despues de cada carga o
  -- alta (resincronizarSecuencia) para que no choque contra la PK.
  cod_conocimiento SERIAL NOT NULL,
  nomb_conocimiento VARCHAR(255) NULL DEFAULT NULL,
  desc_conocimiento TEXT NULL DEFAULT NULL,
  PRIMARY KEY (cod_conocimiento)
);

-- -----------------------------------------------------
-- Table clasificacion.cno_funcion
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cno_funcion CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cno_funcion (
  cod_funcion TEXT NOT NULL,
  desc_funcion_cno TEXT NULL DEFAULT NULL,
  PRIMARY KEY (cod_funcion)
);

-- -----------------------------------------------------
-- Table clasificacion.cno_nivel_cualificacion
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cno_nivel_cualificacion CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cno_nivel_cualificacion (
  cod_cualificacion TEXT NOT NULL,
  niveles_cualificacion VARCHAR(255) NULL DEFAULT NULL,
  descripcion TEXT NULL DEFAULT NULL,
  es_copia BOOLEAN NOT NULL DEFAULT false,
  cod_original TEXT NULL,
  creado_en TIMESTAMPTZ NULL,
  PRIMARY KEY (cod_cualificacion)
);

-- -----------------------------------------------------
-- Table clasificacion.cno_ocupacion
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cno_ocupacion CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cno_ocupacion (
  id SERIAL NOT NULL,
  cod_ocupacion_cno TEXT NOT NULL,
  nomb_ocupacion_cno TEXT NULL DEFAULT NULL,
  descripcion TEXT NULL,
  cod_desempeno_cno TEXT NOT NULL,
  nom_desempeno TEXT NULL DEFAULT NULL,
  cod_cualificacion_cno TEXT NOT NULL,
  niveles_cualificacion VARCHAR(255) NULL DEFAULT NULL,
  campo_ocup_cno TEXT NULL,
  desc_campo_ocup_cno TEXT NULL,
  estado BOOLEAN NULL DEFAULT NULL,
  fecha_registro DATE NULL DEFAULT NULL,
  fecha_inactivacion DATE NULL DEFAULT NULL,
  trazabilidad TEXT NULL,
  cod_ante_ocupacion_cno TEXT NULL,
  id_comparativa INT NULL,
  PRIMARY KEY (cod_ocupacion_cno),
  CONSTRAINT fk_cno_ocupacion_cno_nivel_cualificacion1
    FOREIGN KEY (cod_cualificacion_cno)
    REFERENCES clasificacion.cno_nivel_cualificacion (cod_cualificacion),
  CONSTRAINT fk_cno_ocupacion_cno_area_desempeno1
    FOREIGN KEY (cod_desempeno_cno)
    REFERENCES clasificacion.cno_area_desempeno (cod_desempeno)
);

-- -----------------------------------------------------
-- Table clasificacion.habilidad_destreza
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.habilidad_destreza CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.habilidad_destreza (
  -- SERIAL, por el mismo motivo que cno_conocimiento.cod_conocimiento (migracion 025).
  cod_hab_dest SERIAL NOT NULL,
  nomb_hab_dest TEXT NULL DEFAULT NULL,
  desc_hab_dest TEXT NULL DEFAULT NULL,
  PRIMARY KEY (cod_hab_dest)
);

-- -----------------------------------------------------
-- Table clasificacion.cno_reg_habilidad
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cno_reg_habilidad CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cno_reg_habilidad (
  codigo SERIAL NOT NULL,
  cod_ocupacion_cno TEXT NOT NULL,
  codigo_habilidad INT NOT NULL,
  nomb_hab_dest TEXT NULL DEFAULT NULL,
  PRIMARY KEY (codigo),
  CONSTRAINT fk_cno_habilidad_ocupacion_cno_ocupacion1
    FOREIGN KEY (cod_ocupacion_cno)
    REFERENCES clasificacion.cno_ocupacion (cod_ocupacion_cno),
  CONSTRAINT fk_cno_reg_habilidad_habilidad_destreza1
    FOREIGN KEY (codigo_habilidad)
    REFERENCES clasificacion.habilidad_destreza (cod_hab_dest)
);

-- -----------------------------------------------------
-- Table clasificacion.cno_relacionadas
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cno_relacionadas CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cno_relacionadas (
  codigo SERIAL PRIMARY KEY,
  cod_ocupacion_cno TEXT NOT NULL,
  nombre_ocupacion TEXT NULL,
  codigo_ocupacion TEXT NULL,
  nombre_cno_relacionada TEXT NULL,
  CONSTRAINT fk_cno_relacionadas_cno_ocupacion1
    FOREIGN KEY (cod_ocupacion_cno)
    REFERENCES clasificacion.cno_ocupacion (cod_ocupacion_cno)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_nivel_competencia
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_nivel_competencia CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_nivel_competencia (
  cod_nivel INT NOT NULL,
  nombre_nivel TEXT NULL,
  descripcion TEXT NULL,
  es_copia BOOLEAN NOT NULL DEFAULT false,
  cod_original INTEGER NULL,
  creado_en TIMESTAMPTZ NULL,
  PRIMARY KEY (cod_nivel)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_gran_grupo
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_gran_grupo CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_gran_grupo (
  cod_gran_grupo TEXT NOT NULL,
  nom_gran_grupo TEXT NULL DEFAULT NULL,
  PRIMARY KEY (cod_gran_grupo)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_subgrupo_principal
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_subgrupo_principal CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_subgrupo_principal (
  cod_subgrupo_p TEXT NOT NULL,
  nom_subgrupo_p TEXT NULL DEFAULT NULL,
  cod_gran_grupo TEXT NULL DEFAULT NULL,
  PRIMARY KEY (cod_subgrupo_p),
  CONSTRAINT cuoc_subgrupo_principal_ibfk_1
    FOREIGN KEY (cod_gran_grupo)
    REFERENCES clasificacion.cuoc_gran_grupo (cod_gran_grupo)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_subgrupo
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_subgrupo CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_subgrupo (
  cod_subgrupo_c TEXT NOT NULL,
  nom_subgrupo_c TEXT NULL DEFAULT NULL,
  cod_subgrupo_p TEXT NULL DEFAULT NULL,
  PRIMARY KEY (cod_subgrupo_c),
  CONSTRAINT cuoc_subgrupo_ibfk_1
    FOREIGN KEY (cod_subgrupo_p)
    REFERENCES clasificacion.cuoc_subgrupo_principal (cod_subgrupo_p)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_grupo_primario
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_grupo_primario CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_grupo_primario (
  cod_grupo_prim TEXT NOT NULL,
  nom_grupo_prim TEXT NULL DEFAULT NULL,
  cod_subgrupo_c TEXT NULL DEFAULT NULL,
  PRIMARY KEY (cod_grupo_prim),
  CONSTRAINT cuoc_grupo_primario_ibfk_1
    FOREIGN KEY (cod_subgrupo_c)
    REFERENCES clasificacion.cuoc_subgrupo (cod_subgrupo_c)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_area_cualificacion
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_area_cualificacion CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_area_cualificacion (
  id SERIAL NOT NULL,
  codigo TEXT NOT NULL,
  descripcion TEXT NULL DEFAULT NULL,
  PRIMARY KEY (codigo)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_ocupacion
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_ocupacion CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_ocupacion (
  id SERIAL NOT NULL,
  cod_ocupacion_cuoc TEXT NOT NULL,
  nom_ocupacion_cuoc TEXT NULL DEFAULT NULL,
  desc_ocupacion_cuoc TEXT NULL DEFAULT NULL,
  cod_nivel_cuoc INT NOT NULL,
  nombre TEXT NULL DEFAULT NULL,
  codigo_area_cuoc TEXT NOT NULL,
  nombre_nivel TEXT NULL DEFAULT NULL,
  cod_grupo_prim TEXT NOT NULL,
  fecha_registro DATE NULL DEFAULT NULL,
  estado BOOLEAN NULL DEFAULT NULL,
  fecha_inactivacion DATE NULL DEFAULT NULL,
  trazabilidad TEXT NULL DEFAULT NULL,
  cod_ante_ocupacion_cuoc TEXT NULL,
  id_comparativa INT NULL,
  PRIMARY KEY (cod_ocupacion_cuoc),
  CONSTRAINT fk_cuoc_ocupacion_cuoc_nivel_competencia1
    FOREIGN KEY (cod_nivel_cuoc)
    REFERENCES clasificacion.cuoc_nivel_competencia (cod_nivel),
  CONSTRAINT fk_cuoc_ocupacion_cuoc_grupo_primario1
    FOREIGN KEY (cod_grupo_prim)
    REFERENCES clasificacion.cuoc_grupo_primario (cod_grupo_prim),
  CONSTRAINT fk_cuoc_ocupacion_cuoc_area_cualificacion1
    FOREIGN KEY (codigo_area_cuoc)
    REFERENCES clasificacion.cuoc_area_cualificacion (codigo)
);

-- -----------------------------------------------------
-- Table clasificacion.sector
-- -----------------------------------------------------
-- NOTA: reordenada respecto al script fuente (donde aparece tras
-- `instrumento`) para que exista antes de `respuestas` e `instrumento`.
DROP TABLE IF EXISTS clasificacion.sector CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.sector (
  codigo INT NOT NULL,
  nombre VARCHAR(255) NULL DEFAULT NULL,
  PRIMARY KEY (codigo)
);

-- -----------------------------------------------------
-- Table clasificacion.usuario
-- -----------------------------------------------------
-- NOTA: reordenada respecto al script fuente (donde aparece tras
-- `instrumento`, que ya la referencia via fk_inst_usuario). En el script
-- original esa referencia hacia adelante rompe la ejecucion; aqui se crea
-- antes para que la estructura final resultante sea la misma pero valida.
DROP TABLE IF EXISTS clasificacion.usuario CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.usuario (
  idusuario INT PRIMARY KEY,
  usuario VARCHAR(100) NULL DEFAULT NULL,
  contraseña VARCHAR(255) NULL DEFAULT NULL,
  nombre_apellido TEXT NULL DEFAULT NULL,
  correo VARCHAR(255) NULL DEFAULT NULL,
  documento VARCHAR(20) NULL DEFAULT NULL,
  debe_cambiar_contrasena BOOLEAN NOT NULL DEFAULT false,
  origen VARCHAR(50) DEFAULT 'MANUAL',
  estado SMALLINT NULL,
  fecha_creacion DATE NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS usuario_documento_uk
  ON clasificacion.usuario (documento)
  WHERE documento IS NOT NULL;

-- -----------------------------------------------------
-- Table clasificacion.comparativa_ocupacion
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.comparativa_ocupacion CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.comparativa_ocupacion (
  codigo SERIAL NOT NULL,
  descripcion TEXT NULL DEFAULT NULL,
  estado TEXT NULL DEFAULT NULL,
  fecha_registro DATE NULL DEFAULT NULL,
  id_usuario INT NOT NULL,
  -- Nulas a proposito (desviacion deliberada del script fuente, donde
  -- cod_ocupacion_cno/cno2/cuoc son NOT NULL): un analisis se puede guardar
  -- solo con CNO, solo con CUOC, o con ambos combinados; no siempre hay un
  -- par completo que registrar. Ver analisis.service.ts (guardarAnalisis).
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

-- -----------------------------------------------------
-- Table clasificacion.cuoc_denominacion
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_denominacion CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_denominacion (
  codigo SERIAL NOT NULL,
  cod_denominacion TEXT NOT NULL,
  nom_denominacion TEXT NULL DEFAULT NULL,
  cod_ocupacion_cuoc TEXT NOT NULL,
  fuente_denom TEXT NULL DEFAULT NULL,
  observacion TEXT NULL,
  fecha_registro TIMESTAMP NULL,
  estado SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (cod_denominacion),
  CONSTRAINT fk_cuoc_denominacion_cuoc_ocupacion1
    FOREIGN KEY (cod_ocupacion_cuoc)
    REFERENCES clasificacion.cuoc_ocupacion (cod_ocupacion_cuoc)
);

-- -----------------------------------------------------
-- Table clasificacion.cno_denominacion
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cno_denominacion CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cno_denominacion (
  codigo SERIAL NOT NULL,
  cod_denominacion_cno TEXT NOT NULL,
  desc_denominacion TEXT NULL,
  cno_cod_ocupacion TEXT NOT NULL,
  estado SMALLINT NULL,
  fecha_reg TIMESTAMP NULL,
  fecha_inactivacion TIMESTAMP NULL,
  PRIMARY KEY (codigo, cod_denominacion_cno),
  UNIQUE (cod_denominacion_cno),
  CONSTRAINT fk_cno_denominacion_cno_ocupacion1
    FOREIGN KEY (cno_cod_ocupacion)
    REFERENCES clasificacion.cno_ocupacion (cod_ocupacion_cno)
);

-- -----------------------------------------------------
-- Table clasificacion.correlativa_denominacion
-- (correlativa CNO <-> CUOC a nivel denominacion; antes se llamaba
-- `correlativa`, ver migracion 033)
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.correlativa_denominacion CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.correlativa_denominacion (
  codigo SERIAL NOT NULL,
  cod_ocupacion_cno TEXT NOT NULL,
  cod_denominacion_cno TEXT NOT NULL,
  desc_denominacion_cno TEXT NULL,
  cod_ocupacion_cuoc TEXT NOT NULL,
  cod_denominacion_cuoc TEXT NOT NULL,
  desc_denominacion_cuoc TEXT NULL,
  estado BOOLEAN NULL DEFAULT NULL,
  observacion TEXT NULL DEFAULT NULL,
  PRIMARY KEY (codigo),
  CONSTRAINT fk_correlativa_denom_cno_denominacion
    FOREIGN KEY (cod_denominacion_cno)
    REFERENCES clasificacion.cno_denominacion (cod_denominacion_cno),
  CONSTRAINT fk_correlativa_denom_cuoc_denominacion
    FOREIGN KEY (cod_denominacion_cuoc)
    REFERENCES clasificacion.cuoc_denominacion (cod_denominacion)
);

CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cno_ocup
  ON clasificacion.correlativa_denominacion (cod_ocupacion_cno);
CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cno_denom
  ON clasificacion.correlativa_denominacion (cod_denominacion_cno);
CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cuoc_ocup
  ON clasificacion.correlativa_denominacion (cod_ocupacion_cuoc);
CREATE INDEX IF NOT EXISTS idx_correlativa_denom_cuoc_denom
  ON clasificacion.correlativa_denominacion (cod_denominacion_cuoc);

-- -----------------------------------------------------
-- Table clasificacion.cno_reg_conocimiento
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cno_reg_conocimiento CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cno_reg_conocimiento (
  codigo SERIAL NOT NULL,
  cod_ocupacion_cno TEXT NOT NULL,
  cod_conocimiento INT NOT NULL,
  nomb_conocimiento VARCHAR(255) NULL DEFAULT NULL,
  PRIMARY KEY (codigo),
  CONSTRAINT fk_cnorel_cono
    FOREIGN KEY (cod_ocupacion_cno)
    REFERENCES clasificacion.cno_ocupacion (cod_ocupacion_cno),
  CONSTRAINT fk_cno_conocimientos_cno_conocimiento1
    FOREIGN KEY (cod_conocimiento)
    REFERENCES clasificacion.cno_conocimiento (cod_conocimiento)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_conocimiento
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_conocimiento CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_conocimiento (
  cod_conocimiento INT NOT NULL,
  nomb_conocimiento TEXT NULL DEFAULT NULL,
  desc_conocimiento TEXT NULL DEFAULT NULL,
  PRIMARY KEY (cod_conocimiento)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_destreza
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_destreza CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_destreza (
  cod_destrezas_cuoc SERIAL NOT NULL,
  cod_ocupacion_cuoc TEXT NOT NULL,
  codigo_destreza INT NOT NULL,
  nomb_hab_dest TEXT NULL DEFAULT NULL,
  PRIMARY KEY (cod_destrezas_cuoc),
  CONSTRAINT fk_cuoc_destreza_habilidad_destreza1
    FOREIGN KEY (codigo_destreza)
    REFERENCES clasificacion.habilidad_destreza (cod_hab_dest),
  CONSTRAINT fk_cuoc_destreza_cuoc_ocupacion1
    FOREIGN KEY (cod_ocupacion_cuoc)
    REFERENCES clasificacion.cuoc_ocupacion (cod_ocupacion_cuoc)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_funciones
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_funciones CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_funciones (
  codigo SERIAL NOT NULL,
  cod_funcion_cuoc TEXT NULL DEFAULT NULL,
  nom_funcion_cuoc TEXT NULL DEFAULT NULL,
  cod_ocupacion_cuoc TEXT NOT NULL,
  fecha_registro DATE NULL,
  estado SMALLINT NULL,
  fecha_inactivo TIMESTAMP NULL,
  PRIMARY KEY (codigo),
  CONSTRAINT fk_cuoc_funciones_cuoc_ocupacion1
    FOREIGN KEY (cod_ocupacion_cuoc)
    REFERENCES clasificacion.cuoc_ocupacion (cod_ocupacion_cuoc)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_reg_conocimientos
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_reg_conocimientos CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_reg_conocimientos (
  codigo SERIAL NOT NULL,
  cod_ocupacion_cuoc TEXT NOT NULL,
  cod_conocimiento INT NOT NULL,
  nomb_conocimiento TEXT NULL DEFAULT NULL,
  PRIMARY KEY (codigo),
  CONSTRAINT fk_cuoc_reg_conocimientos_cuoc_conocimiento1
    FOREIGN KEY (cod_conocimiento)
    REFERENCES clasificacion.cuoc_conocimiento (cod_conocimiento),
  CONSTRAINT fk_cuoc_reg_conocimientos_cuoc_ocupacion1
    FOREIGN KEY (cod_ocupacion_cuoc)
    REFERENCES clasificacion.cuoc_ocupacion (cod_ocupacion_cuoc)
);

-- -----------------------------------------------------
-- Table clasificacion.instrumento
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.instrumento CASCADE;

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

-- -----------------------------------------------------
-- Table clasificacion.respuestas
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.respuestas CASCADE;

-- Validacion experta: una fila por experto, instrumento y ronda (migracion
-- 029, que absorbio la antigua `validacion_experta`).
CREATE TABLE IF NOT EXISTS clasificacion.respuestas (
  IdRespuesta SERIAL PRIMARY KEY,
  idusuario INT NOT NULL,
  id_instrumento INT NOT NULL,
  -- en_revision | aprobada | rechazada | ajustes_solicitados
  estado VARCHAR(40) NOT NULL,
  observaciones TEXT NULL,
  fecha_validacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  ronda INT NOT NULL DEFAULT 1,
  nombre_apellido TEXT NULL DEFAULT NULL,
  telefono VARCHAR(45) NULL DEFAULT NULL,
  email TEXT NULL DEFAULT NULL,
  -- Etiqueta del catalogo del frontend en vez de departamento_codigo/ciudad_codigo
  -- con FK (migraciones 025 y 027). Opcionales en BD: el experto guarda
  -- avances antes de diligenciarlos y el cierre los exige por codigo (029).
  departamento TEXT NULL,
  municipio TEXT NULL,
  empresa_entidad TEXT NULL DEFAULT NULL,
  cargo TEXT NULL DEFAULT NULL,
  profesión TEXT NULL DEFAULT NULL,
  sector_codigo INT NULL,
  nombre_ocupacion TEXT NULL,
  descripcion TEXT NULL,
  CONSTRAINT fk_respuestas_instrumento
    FOREIGN KEY (id_instrumento)
    REFERENCES clasificacion.instrumento (idinstrumento)
    ON DELETE CASCADE,
  CONSTRAINT uq_respuestas_instrumento_usuario_ronda UNIQUE (id_instrumento, idusuario, ronda),
  CONSTRAINT ck_respuestas_estado
    CHECK (estado IN ('en_revision', 'aprobada', 'rechazada', 'ajustes_solicitados')),
  CONSTRAINT fk_respuestas_sector1
    FOREIGN KEY (sector_codigo)
    REFERENCES clasificacion.sector (codigo),
  -- NOTA: en el script fuente esta FK referencia la columna inexistente
  -- `usuario_idusuario` (arrastrada por copiar/pegar desde respuestas_copy1);
  -- aqui se corrige a `idusuario`, que es la columna real de esta tabla.
  CONSTRAINT fk_respuestas_usuario1
    FOREIGN KEY (idusuario)
    REFERENCES clasificacion.usuario (idusuario)
);

-- -----------------------------------------------------
-- Table clasificacion.pregunta
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.pregunta CASCADE;

-- NOTA: el script fuente declara `id_pregunta INT NOT NULL AUTO_INCREMENT`
-- (sintaxis MySQL, invalida en PostgreSQL); aqui se usa SERIAL.
CREATE TABLE IF NOT EXISTS clasificacion.pregunta (
  id_pregunta SERIAL NOT NULL,
  id_instrumento INT NOT NULL,
  identificador TEXT NULL,
  detalle TEXT NULL DEFAULT NULL,
  otro TEXT NULL,
  -- Copia de ocupacion del item; NULL = la principal (migracion 028)
  cod_ocupacion TEXT NULL,
  -- Envio a expertos al que pertenece el snapshot: se congela al enviar y un
  -- reenvio escribe una ronda nueva (migracion 029)
  ronda INT NOT NULL DEFAULT 1,
  -- Funcion o denominacion inactiva en la copia al congelar (migracion 034)
  inactivo BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id_pregunta),
  CONSTRAINT fk_pregunta_instrumento1
    FOREIGN KEY (id_instrumento)
    REFERENCES clasificacion.instrumento (idinstrumento)
);

CREATE INDEX IF NOT EXISTS ix_pregunta_instrumento_ocupacion
  ON clasificacion.pregunta (id_instrumento, cod_ocupacion);
CREATE INDEX IF NOT EXISTS ix_pregunta_instrumento_ronda
  ON clasificacion.pregunta (id_instrumento, ronda);

-- -----------------------------------------------------
-- Table clasificacion.pregunta_respuesta
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.pregunta_respuesta CASCADE ;

-- Veredicto de un experto sobre un item del snapshot (migracion 029, que
-- absorbio la antigua `validacion_experta_campo`).
CREATE TABLE IF NOT EXISTS clasificacion.pregunta_respuesta (
  id INT GENERATED BY DEFAULT AS IDENTITY,
  idusuario INT NOT NULL,
  idRespuesta INT NOT NULL,
  id_pregunta INT NOT NULL,
  -- aplica | no_aplica | requiere_ajuste | propuesta_mejora
  respuesta TEXT NULL,
  -- Comentario del experto sobre el item
  otro TEXT NULL,
  -- Texto que el experto propone para el item (descripcion, area)
  valor_propuesto TEXT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_pregunta_respuesta_respuesta_pregunta UNIQUE (idRespuesta, id_pregunta),
  CONSTRAINT ck_pregunta_respuesta_respuesta
    CHECK (respuesta IN ('aplica', 'no_aplica', 'requiere_ajuste', 'propuesta_mejora')),
  CONSTRAINT fk_respuestas_pregunta
    FOREIGN KEY (id_pregunta)
    REFERENCES clasificacion.pregunta (id_pregunta),
  CONSTRAINT fk_pregunta_respuesta_usuario1
    FOREIGN KEY (idusuario)
    REFERENCES clasificacion.usuario (idusuario),
  CONSTRAINT fk_pregunta_respuesta_respuestas
    FOREIGN KEY (idRespuesta)
    REFERENCES clasificacion.respuestas (IdRespuesta)
    ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS ix_pregunta_respuesta_pregunta
  ON clasificacion.pregunta_respuesta (id_pregunta);

-- -----------------------------------------------------
-- Table clasificacion.instrumento_experto
-- -----------------------------------------------------
-- Expertos a los que se envio cada instrumento, por ronda (migracion 029)
DROP TABLE IF EXISTS clasificacion.instrumento_experto CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.instrumento_experto (
  id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  id_instrumento INT NOT NULL,
  idusuario INT NOT NULL,
  ronda INT NOT NULL DEFAULT 1,
  asignado_por INT NULL,
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_instrumento_experto_instrumento
    FOREIGN KEY (id_instrumento)
    REFERENCES clasificacion.instrumento (idinstrumento)
    ON DELETE CASCADE,
  CONSTRAINT fk_instrumento_experto_usuario
    FOREIGN KEY (idusuario)
    REFERENCES clasificacion.usuario (idusuario),
  CONSTRAINT fk_instrumento_experto_asignado_por
    FOREIGN KEY (asignado_por)
    REFERENCES clasificacion.usuario (idusuario),
  CONSTRAINT uq_instrumento_experto UNIQUE (id_instrumento, idusuario, ronda)
);

-- -----------------------------------------------------
-- Table clasificacion.cno_reg_funciones
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cno_reg_funciones CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cno_reg_funciones (
  codigo TEXT PRIMARY KEY,
  cod_funcion TEXT NOT NULL,
  desc_funcion_cno TEXT NULL,
  cno_ocupacion TEXT NOT NULL,
  estado SMALLINT NULL,
  CONSTRAINT fk_cno_reg_funciones_cno_ocupacion1
    FOREIGN KEY (cno_ocupacion)
    REFERENCES clasificacion.cno_ocupacion (cod_ocupacion_cno),
  CONSTRAINT fk_cno_reg_funciones_cno_funcion1
    FOREIGN KEY (cod_funcion)
    REFERENCES clasificacion.cno_funcion (cod_funcion)
);

-- -----------------------------------------------------
-- Table clasificacion.cuoc_ocupacion_afin
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.cuoc_ocupacion_afin CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.cuoc_ocupacion_afin (
  codigo SERIAL NOT NULL,
  cod_ocupacion_cuoc TEXT NOT NULL,
  nombre_ocupacion TEXT NULL,
  codigo_ocupacion TEXT NULL,
  nombre_cno_afin TEXT NULL,
  PRIMARY KEY (codigo),
  CONSTRAINT fk_cuoc_ocupacion_afin_cuoc_ocupacion1
    FOREIGN KEY (cod_ocupacion_cuoc)
    REFERENCES clasificacion.cuoc_ocupacion (cod_ocupacion_cuoc)
);

-- -----------------------------------------------------
-- Table clasificacion.correlativa_ocupacion
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
-- Table clasificacion.correlativa_conocimiento
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
-- Table clasificacion.roles
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.roles CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NULL DEFAULT NULL,
  descripcion TEXT NULL DEFAULT NULL
);

-- -----------------------------------------------------
-- Table clasificacion.usuario_roles
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.usuario_roles CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.usuario_roles (
  id INT NOT NULL,
  idusuario INT NOT NULL,
  id_roles INT NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_usuario_roles_roles1
    FOREIGN KEY (id_roles)
    REFERENCES clasificacion.roles (id),
  CONSTRAINT fk_usuario_roles_usuario1
    FOREIGN KEY (idusuario)
    REFERENCES clasificacion.usuario (idusuario)
);

-- -----------------------------------------------------
-- Table clasificacion.permiso
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.permiso CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.permiso (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NULL DEFAULT NULL,
  descripcion TEXT NULL DEFAULT NULL
);

-- -----------------------------------------------------
-- Table clasificacion.roles_permiso
-- -----------------------------------------------------
DROP TABLE IF EXISTS clasificacion.roles_permiso CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.roles_permiso (
  id INT NOT NULL,
  permiso_id INT NOT NULL,
  usuario_roles_id INT NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_permiso_has_usuario_roles_permiso1
    FOREIGN KEY (permiso_id)
    REFERENCES clasificacion.permiso (id),
  CONSTRAINT fk_permiso_has_usuario_roles_usuario_roles1
    FOREIGN KEY (usuario_roles_id)
    REFERENCES clasificacion.usuario_roles (id)
);

-- -----------------------------------------------------
-- Table clasificacion.respuestas_copy1
-- -----------------------------------------------------
-- Estructura amplia (f1-f20, d1-d20, r1-r20, h1-h20, c1-c10) que en el
-- script fuente antecedia a la nueva `respuestas` simplificada; se conserva
-- bajo este nombre tal como la deja clasificacion.sql.
DROP TABLE IF EXISTS clasificacion.respuestas_copy1 CASCADE;

CREATE TABLE IF NOT EXISTS clasificacion.respuestas_copy1 (
  IdRespuesta SERIAL PRIMARY KEY,
  usuario_idusuario INT NOT NULL,
  detalle TEXT NULL DEFAULT NULL,
  respuestascol VARCHAR(45) NULL DEFAULT NULL,
  nombre_apellido VARCHAR(120) NULL DEFAULT NULL,
  email TEXT NULL DEFAULT NULL,
  instrumento_idinstrumento INT NOT NULL,
  telefono VARCHAR(45) NULL DEFAULT NULL,
  departamento TEXT NULL,
  municipio TEXT NULL,
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
  CONSTRAINT fk_respuestas_copy1_instrumento1
    FOREIGN KEY (instrumento_idinstrumento)
    REFERENCES clasificacion.instrumento (idinstrumento),
  CONSTRAINT fk_respuestas_copy1_sector1
    FOREIGN KEY (sector_codigo)
    REFERENCES clasificacion.sector (codigo),
  CONSTRAINT fk_respuestas_copy1_usuario1
    FOREIGN KEY (usuario_idusuario)
    REFERENCES clasificacion.usuario (idusuario)
);
