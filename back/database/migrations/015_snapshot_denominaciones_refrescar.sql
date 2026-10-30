-- ============================================================
--  015_snapshot_denominaciones_refrescar
--
--  Refresca en los snapshots ya tomados el nombre de las denominaciones que
--  las migraciones 009/010/014 corrigieron en el catálogo.
--
--  Por qué: `pregunta` es la foto del instrumento que se toma al guardar o
--  enviar a experto, y `validacion_experta_campo.valor_original` es lo que el
--  experto vio al calificar. Ambas se llenaron ANTES de corregir el catálogo,
--  así que conservan el código en vez del nombre ("D-0112.001" donde debía
--  decir el nombre). Son las fuentes de Validación Experta y de Resumen: por
--  eso ahí seguía saliendo el código aunque la tabla viva ya estuviera bien.
--
--  Cómo: `pregunta.otro` guarda el código de la denominación de la copia
--  ("0112-14-D1"); se cruza con `cno_denominacion` y se trae la descripción.
--  Para `valor_original` se cruza por el código que quedó como valor.
--
--  Solo se tocan filas cuyo texto actual tiene forma de código; las demás
--  listas del snapshot (funciones, conocimientos, habilidades, relacionadas)
--  ya traían nombre y no se tocan. Idempotente.
--
--  NO lleva BEGIN/COMMIT: el runner envuelve cada archivo en su transacción.
-- ============================================================

-- 1. Snapshot del instrumento
UPDATE clasificacion.pregunta p
SET    detalle = d.desc_denominacion
FROM   clasificacion.cno_denominacion d
WHERE  p.identificador = 'denominacion'
  AND  d.cod_denominacion_cno = p.otro
  AND  d.desc_denominacion !~ '^D-[0-9]+\.[0-9]+$'
  AND  (p.detalle ~ '^D-[0-9]+\.[0-9]+$' OR p.detalle = p.otro);

-- 2. Lo que el experto ya calificó
UPDATE clasificacion.validacion_experta_campo c
SET    valor_original = d.desc_denominacion
FROM   clasificacion.cno_denominacion d
WHERE  c.valor_original ~ '^D-[0-9]+\.[0-9]+$'
  AND  d.cod_denominacion_cno = c.valor_original
  AND  d.desc_denominacion !~ '^D-[0-9]+\.[0-9]+$';
