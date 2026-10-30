-- ============================================================
--  024_niveles_copias_analisis
--
--  En Actualización, "Agregar nivel" y "Editar nivel" no guardaban nada:
--  solo cambiaban la lista en pantalla y se perdían al recargar.
--
--  Regla: el catálogo oficial de niveles solo cambia con la carga del Excel
--  oficial. Lo que se agregue o edite a mano en Actualización se guarda como
--  COPIA, que solo se usa en Análisis (igual que las copias de ocupaciones):
--    - es_copia     marca la fila; las consultas oficiales la excluyen.
--    - cod_original nivel oficial del que salió (NULL si es un nivel nuevo).
--    - creado_en    cuándo se creó la copia.
--
--  cuoc_nivel_competencia no tenía descripción; se agrega para que el
--  formulario sea igual en CNO y CUOC.
--
--  Idempotente. Sin BEGIN/COMMIT: el runner envuelve el archivo.
-- ============================================================

ALTER TABLE clasificacion.cno_nivel_cualificacion
  ADD COLUMN IF NOT EXISTS es_copia BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cod_original TEXT NULL,
  ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ NULL;

ALTER TABLE clasificacion.cuoc_nivel_competencia
  ADD COLUMN IF NOT EXISTS descripcion TEXT NULL,
  ADD COLUMN IF NOT EXISTS es_copia BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cod_original INTEGER NULL,
  ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ NULL;
