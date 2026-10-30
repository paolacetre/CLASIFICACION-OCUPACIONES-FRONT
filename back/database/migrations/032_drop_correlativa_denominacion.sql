-- ============================================================================
-- 032 · Eliminar la COPIA vieja de clasificacion.correlativa_denominacion
-- ============================================================================
--
-- La creó la migración 019 como copia única de clasificacion.correlativa y
-- nunca más se actualizó: el sistema (listado, export, cargas, API) leía y
-- escribía en `correlativa`. Para 2026-10-08 la copia ya no coincidía (9.477
-- filas frente a 9.104; 8.877 en común).
--
-- Se borra la copia, NO el nombre: la tabla que se queda es
-- `correlativa_denominacion` (igual que correlativa_ocupacion y
-- correlativa_conocimiento). La 033 renombra `correlativa` a ese nombre con
-- sus datos vigentes.
--
-- Solo se borra si `correlativa` también existe, es decir, si esta es de
-- verdad la copia vieja. En una BD creada desde 01-schema.sql ya no hay
-- `correlativa` y `correlativa_denominacion` es la tabla buena: no se toca.
--
-- Antes de borrarla se dejó un respaldo verificado fuera del repositorio
-- (respaldos/correlativa_denominacion_respaldo_2026-10-08.sql y .xlsx).
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('clasificacion.correlativa') IS NOT NULL
     AND to_regclass('clasificacion.correlativa_denominacion') IS NOT NULL THEN
    DROP TABLE clasificacion.correlativa_denominacion;
  END IF;
END $$;
