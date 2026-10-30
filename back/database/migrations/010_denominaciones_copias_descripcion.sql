-- ============================================================
--  010_denominaciones_copias_descripcion
--
--  Propaga a las COPIAS de análisis la descripción real de denominación que
--  la 009 cargó en el catálogo.
--
--  Por qué: las copias se crearon a partir de originales que tenían el código
--  metido en la columna de descripción, así que heredaron ese valor. Una copia
--  queda con `cod_denominacion_cno = '3112-16-1-D1'` y
--  `desc_denominacion = 'D-3112.001'`: su descripción es, literalmente, el
--  código de la denominación original. La 009 no las alcanza porque su
--  condición es `desc = cod`, y en una copia esos dos valores ya difieren.
--
--  Ese mismo accidente es lo que permite repararlas sin volver a cargar el
--  Excel: la descripción de la copia ES la clave del original. Se cruza contra
--  `cno_denominacion` ya corregida y se trae el nombre de verdad.
--
--  Solo afecta filas cuya descripción coincide exactamente con el código de
--  otra denominación que ya tiene descripción real. Una copia que el analista
--  haya editado a mano no cumple esa condición y no se toca. Idempotente: tras
--  el primer pase la descripción deja de parecerse a un código.
--
--  Depende de 009. NO lleva BEGIN/COMMIT: el runner envuelve cada archivo en
--  su propia transacción.
-- ============================================================

UPDATE clasificacion.cno_denominacion copia
SET    desc_denominacion = original.desc_denominacion
FROM   clasificacion.cno_denominacion original
WHERE  copia.desc_denominacion = original.cod_denominacion_cno
  -- El original ya tiene nombre real (la 009 lo cargó).
  AND  original.desc_denominacion <> original.cod_denominacion_cno
  -- Nunca reescribir la fila del propio catálogo.
  AND  copia.cod_denominacion_cno <> original.cod_denominacion_cno;
