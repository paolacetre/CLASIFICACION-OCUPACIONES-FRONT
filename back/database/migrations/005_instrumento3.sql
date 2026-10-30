-- ============================================================
--  005_instrumento3
--
--  Da backend al Instrumento 3 (propuesta de nuevos perfiles
--  ocupacionales), que hasta ahora vivía 100% en el frontend dentro del
--  mock en memoria de shared/bandeja-experto: cada propuesta se perdía al
--  recargar la página y nunca llegaba de forma durable al experto.
--
--  Reparto del almacenamiento (mismo patrón que Instrumento 2):
--    · `instrumento`             → cabecera (tipo='instrumento3', estado, fecha, usuario)
--    · `instrumento3_propuesta`  → campos escalares del formulario (esta tabla)
--    · `pregunta`                → listas sin tope: funciones, denominaciones,
--                                  habilidades, conocimientos, relacionadas.
--                                  Es además lo que ya lee Validación Experta.
--    · `validacion_experta`      → veredicto del experto; como apunta a
--                                  `instrumento`, funciona para I3 sin cambios.
--
--  Por qué no se reusa `respuestas_copy1`, que a primera vista calza:
--  exige `departamento_codigo`, `ciudad_codigo` y `sector_codigo` NOT NULL
--  contra `departamento`, `ciudad` y `sector`, y esas tres tablas están
--  VACÍAS (el frontend resuelve geografía y sectores con constantes locales,
--  no contra el catálogo). Todo INSERT fallaría por FK. Además f1-f20 /
--  d1-d20 / h1-h20 / c1-c10 imponen un techo artificial de ítems que el
--  formulario no tiene. Aquí la geografía y el sector se guardan como texto,
--  que es lo que realmente envía el formulario.
--
--  Idempotente y aditivo: no toca ninguna tabla existente. NO lleva
--  BEGIN/COMMIT: el runner (scripts/db-migrate.js) envuelve cada archivo en
--  su propia transacción.
-- ============================================================

SET search_path TO clasificacion;

CREATE TABLE IF NOT EXISTS clasificacion.instrumento3_propuesta (
  id_propuesta             SERIAL   PRIMARY KEY,
  id_instrumento           INTEGER  NOT NULL,

  -- ── Información del informante ──
  nombre_apellidos         TEXT     NULL,
  email                    TEXT     NULL,
  telefono                 VARCHAR(45) NULL,
  -- Geografía y sector como texto: el formulario envía los valores del
  -- catálogo del frontend, no códigos de `departamento` / `ciudad` / `sector`
  departamento             TEXT     NULL,
  municipio                TEXT     NULL,
  empresa_entidad          TEXT     NULL,
  cargo                    TEXT     NULL,
  profesion                TEXT     NULL,
  sector                   TEXT     NULL,

  -- ── Propuesta ocupacional ──
  cod_ocupacion_cno        TEXT     NULL,
  cod_ocupacion_cuoc       TEXT     NULL,
  nombre_ocupacion         TEXT     NULL,
  cod_area                 INTEGER  NULL,
  area_desempeno           TEXT     NULL,
  cod_nivel_cualificacion  INTEGER  NULL,
  nivel_cualificacion      TEXT     NULL,
  descripcion              TEXT     NULL,
  otras_habilidades        TEXT     NULL,
  otros_conocimientos      TEXT     NULL,

  CONSTRAINT fk_instrumento3_propuesta_instrumento
    FOREIGN KEY (id_instrumento)
    REFERENCES clasificacion.instrumento (idinstrumento)
    ON DELETE CASCADE,
  -- Una propuesta por instrumento
  CONSTRAINT uq_instrumento3_propuesta_instrumento UNIQUE (id_instrumento)
);

CREATE INDEX IF NOT EXISTS ix_instrumento3_propuesta_instrumento
  ON clasificacion.instrumento3_propuesta (id_instrumento);
