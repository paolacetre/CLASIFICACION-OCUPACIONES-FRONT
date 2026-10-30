-- ============================================================
--  035_cno_2026_nivel_y_campo
--
--  El libro base pasa a ser "CNO_2026_10-09Actualizado (2).xlsx". Cambia:
--
--  1. Campo ocupacional: la hoja "Ocupaciones - C.N.O." trae el código
--     (campo_ocupacional, p. ej. "001") y ahora también su descripción
--     (descripcion_campo, p. ej. "Dirección pública y privada"). En BD solo
--     existía el código (campo_ocup_cno); se agrega desc_campo_ocup_cno.
--
--  2. Nivel de cualificación: los códigos dejan de ser 0..9 y pasan a ser los
--     oficiales "Nivel 1 (A)", "Nivel 2 (B)", "Nivel 3,4 (C)" y "Nivel 6 (D)".
--     La equivalencia sale de cruzar las 611 ocupaciones del libro nuevo con
--     las de la BD (todas coinciden):
--       0, 1    -> Nivel 1 (A)   (Dirección y Gerencia + Profesionales)
--       2       -> Nivel 2 (B)
--       3, 4, 5 -> Nivel 3,4 (C)
--       6       -> Nivel 6 (D)
--     Se crean los niveles nuevos, se repuntan las ocupaciones (catálogo y
--     copias de Análisis) y las copias de nivel, y se borran los niveles viejos
--     que ya nada usa (7, 8 y 9 eran filas de relleno sin ocupaciones).
--     Nombre y descripción definitivos los fija la carga del Excel; aquí solo
--     se deja un valor inicial para que nada quede sin nivel entre tanto.
--
--  En una BD vacía (sin niveles 0..6) no inserta nada: la carga del Excel
--  crea los niveles nuevos directamente.
--
--  Idempotente. Sin BEGIN/COMMIT: el runner envuelve el archivo.
-- ============================================================

ALTER TABLE clasificacion.cno_ocupacion
  ADD COLUMN IF NOT EXISTS desc_campo_ocup_cno TEXT NULL;

CREATE TEMP TABLE tmp_nivel_cno_2026 (
  cod_viejo text PRIMARY KEY,
  cod_nuevo text NOT NULL,
  nombre    text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_nivel_cno_2026 (cod_viejo, cod_nuevo, nombre) VALUES
  ('0', 'Nivel 1 (A)',   'Profesionales, Dirección y Gerencia'),
  ('1', 'Nivel 1 (A)',   'Profesionales, Dirección y Gerencia'),
  ('2', 'Nivel 2 (B)',   'Tecnicos y supervisores'),
  ('3', 'Nivel 3,4 (C)', 'Auxiliares y operativos'),
  ('4', 'Nivel 3,4 (C)', 'Auxiliares y operativos'),
  ('5', 'Nivel 3,4 (C)', 'Auxiliares y operativos'),
  ('6', 'Nivel 6 (D)',   'Obreros y ayudantes');

-- 1. Niveles nuevos, con la descripción que ya tenía el nivel viejo (sin los
--    espacios de relleno). Solo si existe el nivel viejo.
INSERT INTO clasificacion.cno_nivel_cualificacion (cod_cualificacion, niveles_cualificacion, descripcion, es_copia)
SELECT DISTINCT ON (t.cod_nuevo)
       t.cod_nuevo,
       t.nombre,
       NULLIF(btrim(regexp_replace(n.descripcion, '\s+', ' ', 'g')), ''),
       false
FROM tmp_nivel_cno_2026 t
JOIN clasificacion.cno_nivel_cualificacion n
  ON n.cod_cualificacion = t.cod_viejo AND NOT n.es_copia
ORDER BY t.cod_nuevo, (n.descripcion IS NULL), t.cod_viejo
ON CONFLICT (cod_cualificacion) DO NOTHING;

-- 2. Ocupaciones (catálogo y copias) al nivel nuevo.
UPDATE clasificacion.cno_ocupacion o
SET cod_cualificacion_cno = t.cod_nuevo,
    niveles_cualificacion = n.niveles_cualificacion
FROM tmp_nivel_cno_2026 t
JOIN clasificacion.cno_nivel_cualificacion n ON n.cod_cualificacion = t.cod_nuevo
WHERE o.cod_cualificacion_cno = t.cod_viejo;

-- 3. Copias de nivel (Análisis) que apuntaban a un nivel oficial viejo.
UPDATE clasificacion.cno_nivel_cualificacion c
SET cod_original = t.cod_nuevo
FROM tmp_nivel_cno_2026 t
WHERE c.es_copia
  AND c.cod_original = t.cod_viejo
  AND EXISTS (SELECT 1 FROM clasificacion.cno_nivel_cualificacion n WHERE n.cod_cualificacion = t.cod_nuevo);

-- 4. Niveles oficiales viejos (códigos numéricos) que ya nada usa.
DELETE FROM clasificacion.cno_nivel_cualificacion n
WHERE NOT n.es_copia
  AND n.cod_cualificacion ~ '^[0-9]+$'
  AND NOT EXISTS (
    SELECT 1 FROM clasificacion.cno_ocupacion o WHERE o.cod_cualificacion_cno = n.cod_cualificacion
  );
