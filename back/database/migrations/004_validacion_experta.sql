-- ============================================================
--  004_validacion_experta
--
--  Da persistencia real al módulo de Validación Experta.
--
--  Hasta ahora el veredicto del experto vivía SOLO en memoria del frontend
--  (BandejaExpertoService.guardarResultadoValidacion escribía en un array
--  mock), así que se perdía al recargar la página. El envío desde
--  Instrumento 2 y el snapshot de `pregunta` ya eran reales; lo único que
--  faltaba era dónde guardar el resultado.
--
--  Por qué tablas nuevas y no `pregunta_respuesta`: esa tabla pertenece al
--  flujo de encuesta CUOC (exige `idusuario` e `idrespuesta` NOT NULL contra
--  `respuestas`, que está vacía) y su `id` no tiene secuencia. Forzarla
--  obligaría a insertar filas de contacto ficticias y a calcular ids a mano.
--
--  Estructura: cabecera 1:1 con el instrumento + detalle por campo, que es
--  exactamente la forma del modelo `ResultadoValidacion` / `ValidacionCampo`
--  que el frontend ya tiene definido.
--
--  Idempotente y aditivo: no toca ninguna tabla existente. NO lleva
--  BEGIN/COMMIT: el runner (scripts/db-migrate.js) envuelve cada archivo en
--  su propia transacción.
-- ============================================================

SET search_path TO clasificacion;

-- ── 1. Cabecera: una validación vigente por instrumento ──
CREATE TABLE IF NOT EXISTS clasificacion.validacion_experta (
  id_validacion     SERIAL       PRIMARY KEY,
  id_instrumento    INTEGER      NOT NULL,
  idusuario         INTEGER      NULL,
  experto_nombre    TEXT         NULL,
  -- en_revision | aprobada | rechazada | ajustes_solicitados
  estado            VARCHAR(40)  NOT NULL,
  observaciones     TEXT         NULL,
  fecha_validacion  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT fk_validacion_experta_instrumento
    FOREIGN KEY (id_instrumento)
    REFERENCES clasificacion.instrumento (idinstrumento)
    ON DELETE CASCADE,
  CONSTRAINT fk_validacion_experta_usuario
    FOREIGN KEY (idusuario)
    REFERENCES clasificacion.usuario (idusuario),
  -- El guardado es un upsert: revalidar reemplaza el veredicto anterior
  CONSTRAINT uq_validacion_experta_instrumento UNIQUE (id_instrumento)
);

-- ── 2. Detalle: veredicto por cada campo validado ──
CREATE TABLE IF NOT EXISTS clasificacion.validacion_experta_campo (
  id_campo          SERIAL       PRIMARY KEY,
  id_validacion     INTEGER      NOT NULL,
  -- Identificador del campo (coincide con `pregunta.identificador` cuando
  -- el ítem proviene del snapshot: nombre, descripcion, funcion, ...)
  campo             TEXT         NOT NULL,
  etiqueta          TEXT         NULL,
  valor_original    TEXT         NULL,
  -- aplica | no_aplica | requiere_ajuste | propuesta_mejora
  estado            VARCHAR(30)  NOT NULL,
  razon             TEXT         NULL,
  observacion       TEXT         NULL,
  propuesta_mejora  TEXT         NULL,
  CONSTRAINT fk_validacion_experta_campo_validacion
    FOREIGN KEY (id_validacion)
    REFERENCES clasificacion.validacion_experta (id_validacion)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_validacion_experta_campo_validacion
  ON clasificacion.validacion_experta_campo (id_validacion);

CREATE INDEX IF NOT EXISTS ix_validacion_experta_instrumento
  ON clasificacion.validacion_experta (id_instrumento);
