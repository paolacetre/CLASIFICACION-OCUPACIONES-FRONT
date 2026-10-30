-- =============================================================================
-- Consultas CUOC (Clasificación Única de Ocupaciones para Colombia)
-- Esquema: clasificacion  ·  Solo lectura (SELECT), no modifica datos.
--
-- Uso:
--   docker exec -i clasificacion_bd psql -U postgres -d clasificacion \
--     < back/database/consultas/consultas_cuoc.sql
--   o copiar la consulta que se necesite en pgAdmin / DBeaver.
--
-- Para filtrar por una ocupación concreta cambia el valor de :'ocup'
-- (psql) o reemplaza el código directamente en el WHERE.
--
-- Nota: las filas con id_comparativa NOT NULL son copias creadas desde
-- Análisis; el catálogo original es id_comparativa IS NULL.
-- =============================================================================

SET search_path TO clasificacion, public;
\set ocup '11110'


-- 1. Resumen: cantidad de registros por tabla CUOC ----------------------------
SELECT 'cuoc_gran_grupo'          AS tabla, COUNT(*) AS total FROM cuoc_gran_grupo
UNION ALL SELECT 'cuoc_subgrupo_principal', COUNT(*) FROM cuoc_subgrupo_principal
UNION ALL SELECT 'cuoc_subgrupo',           COUNT(*) FROM cuoc_subgrupo
UNION ALL SELECT 'cuoc_grupo_primario',     COUNT(*) FROM cuoc_grupo_primario
UNION ALL SELECT 'cuoc_area_cualificacion', COUNT(*) FROM cuoc_area_cualificacion
UNION ALL SELECT 'cuoc_nivel_competencia',  COUNT(*) FROM cuoc_nivel_competencia
UNION ALL SELECT 'cuoc_ocupacion (original)', COUNT(*) FROM cuoc_ocupacion WHERE id_comparativa IS NULL
UNION ALL SELECT 'cuoc_ocupacion (copias)',   COUNT(*) FROM cuoc_ocupacion WHERE id_comparativa IS NOT NULL
UNION ALL SELECT 'cuoc_denominacion',       COUNT(*) FROM cuoc_denominacion
UNION ALL SELECT 'cuoc_funciones',          COUNT(*) FROM cuoc_funciones
UNION ALL SELECT 'cuoc_conocimiento',       COUNT(*) FROM cuoc_conocimiento
UNION ALL SELECT 'cuoc_reg_conocimientos',  COUNT(*) FROM cuoc_reg_conocimientos
UNION ALL SELECT 'cuoc_destreza',           COUNT(*) FROM cuoc_destreza
UNION ALL SELECT 'cuoc_ocupacion_afin',     COUNT(*) FROM cuoc_ocupacion_afin;


-- 2. Catálogos base ------------------------------------------------------------
SELECT cod_nivel, nombre_nivel, descripcion, es_copia, cod_original
FROM   cuoc_nivel_competencia
ORDER  BY es_copia, cod_nivel;

SELECT codigo, descripcion
FROM   cuoc_area_cualificacion
ORDER  BY codigo;


-- 3. Jerarquía completa: gran grupo > subgrupo principal > subgrupo > grupo primario
SELECT gg.cod_gran_grupo, gg.nom_gran_grupo,
       sp.cod_subgrupo_p, sp.nom_subgrupo_p,
       sg.cod_subgrupo_c, sg.nom_subgrupo_c,
       gp.cod_grupo_prim, gp.nom_grupo_prim
FROM   cuoc_gran_grupo gg
LEFT   JOIN cuoc_subgrupo_principal sp ON sp.cod_gran_grupo = gg.cod_gran_grupo
LEFT   JOIN cuoc_subgrupo           sg ON sg.cod_subgrupo_p = sp.cod_subgrupo_p
LEFT   JOIN cuoc_grupo_primario     gp ON gp.cod_subgrupo_c = sg.cod_subgrupo_c
ORDER  BY gg.cod_gran_grupo, sp.cod_subgrupo_p, sg.cod_subgrupo_c, gp.cod_grupo_prim;


-- 4. Listado de ocupaciones del catálogo original con jerarquía, nivel y área -
SELECT o.cod_ocupacion_cuoc,
       o.nom_ocupacion_cuoc,
       gp.cod_grupo_prim, gp.nom_grupo_prim,
       gg.cod_gran_grupo, gg.nom_gran_grupo,
       n.cod_nivel, n.nombre_nivel,
       ac.codigo AS cod_area, ac.descripcion AS area_cualificacion,
       o.estado,
       o.fecha_registro
FROM   cuoc_ocupacion o
LEFT   JOIN cuoc_grupo_primario     gp ON gp.cod_grupo_prim = o.cod_grupo_prim
LEFT   JOIN cuoc_subgrupo           sg ON sg.cod_subgrupo_c = gp.cod_subgrupo_c
LEFT   JOIN cuoc_subgrupo_principal sp ON sp.cod_subgrupo_p = sg.cod_subgrupo_p
LEFT   JOIN cuoc_gran_grupo         gg ON gg.cod_gran_grupo = sp.cod_gran_grupo
LEFT   JOIN cuoc_nivel_competencia  n  ON n.cod_nivel       = o.cod_nivel_cuoc
LEFT   JOIN cuoc_area_cualificacion ac ON ac.codigo         = o.codigo_area_cuoc
WHERE  o.id_comparativa IS NULL
ORDER  BY o.cod_ocupacion_cuoc;


-- 5. Ficha completa de una ocupación ------------------------------------------
SELECT o.*, n.nombre_nivel AS nivel, ac.descripcion AS area, gp.nom_grupo_prim AS grupo_primario
FROM   cuoc_ocupacion o
LEFT   JOIN cuoc_nivel_competencia  n  ON n.cod_nivel       = o.cod_nivel_cuoc
LEFT   JOIN cuoc_area_cualificacion ac ON ac.codigo         = o.codigo_area_cuoc
LEFT   JOIN cuoc_grupo_primario     gp ON gp.cod_grupo_prim = o.cod_grupo_prim
WHERE  o.cod_ocupacion_cuoc = :'ocup';

-- 5.1 Denominaciones
SELECT cod_denominacion, nom_denominacion, fuente_denom, estado, fecha_registro, observacion
FROM   cuoc_denominacion
WHERE  cod_ocupacion_cuoc = :'ocup'
ORDER  BY cod_denominacion;

-- 5.2 Funciones
SELECT cod_funcion_cuoc, nom_funcion_cuoc, estado, fecha_registro, fecha_inactivo
FROM   cuoc_funciones
WHERE  cod_ocupacion_cuoc = :'ocup'
ORDER  BY cod_funcion_cuoc;

-- 5.3 Conocimientos
SELECT rc.cod_conocimiento, COALESCE(rc.nomb_conocimiento, c.nomb_conocimiento) AS conocimiento
FROM   cuoc_reg_conocimientos rc
LEFT   JOIN cuoc_conocimiento c ON c.cod_conocimiento = rc.cod_conocimiento
WHERE  rc.cod_ocupacion_cuoc = :'ocup'
ORDER  BY rc.cod_conocimiento;

-- 5.4 Destrezas
SELECT d.codigo_destreza, COALESCE(d.nomb_hab_dest, h.nomb_hab_dest) AS destreza
FROM   cuoc_destreza d
LEFT   JOIN habilidad_destreza h ON h.cod_hab_dest = d.codigo_destreza
WHERE  d.cod_ocupacion_cuoc = :'ocup'
ORDER  BY d.codigo_destreza;

-- 5.5 Ocupaciones afines
SELECT codigo_ocupacion, nombre_cno_afin
FROM   cuoc_ocupacion_afin
WHERE  cod_ocupacion_cuoc = :'ocup'
ORDER  BY codigo_ocupacion;

-- 5.6 Correlativa hacia CNO
SELECT co.cno_ocupacion_cno, co.nomb_ocupacion_cno, co.observacion
FROM   correlativa_ocupacion co
WHERE  co.cuoc_ocupacion_cuoc = :'ocup'
ORDER  BY co.cno_ocupacion_cno;


-- 6. Búsqueda por texto (sin tildes) en ocupaciones y denominaciones ----------
\set texto 'gerente'
SELECT DISTINCT o.cod_ocupacion_cuoc, o.nom_ocupacion_cuoc, d.nom_denominacion
FROM   cuoc_ocupacion o
LEFT   JOIN cuoc_denominacion d ON d.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc
WHERE  o.id_comparativa IS NULL
  AND (   public.unaccent(o.nom_ocupacion_cuoc) ILIKE '%' || public.unaccent(:'texto') || '%'
       OR public.unaccent(d.nom_denominacion)   ILIKE '%' || public.unaccent(:'texto') || '%')
ORDER  BY o.cod_ocupacion_cuoc;


-- 7. Totales por ocupación (denominaciones, funciones, conocimientos, destrezas)
SELECT o.cod_ocupacion_cuoc,
       o.nom_ocupacion_cuoc,
       (SELECT COUNT(*) FROM cuoc_denominacion      d WHERE d.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc) AS denominaciones,
       (SELECT COUNT(*) FROM cuoc_funciones         f WHERE f.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc) AS funciones,
       (SELECT COUNT(*) FROM cuoc_reg_conocimientos c WHERE c.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc) AS conocimientos,
       (SELECT COUNT(*) FROM cuoc_destreza          x WHERE x.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc) AS destrezas,
       (SELECT COUNT(*) FROM cuoc_ocupacion_afin    a WHERE a.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc) AS afines
FROM   cuoc_ocupacion o
WHERE  o.id_comparativa IS NULL
ORDER  BY o.cod_ocupacion_cuoc;


-- 8. Ocupaciones por gran grupo, nivel de competencia y área ------------------
SELECT gg.cod_gran_grupo, gg.nom_gran_grupo, COUNT(o.cod_ocupacion_cuoc) AS ocupaciones
FROM   cuoc_gran_grupo gg
LEFT   JOIN cuoc_subgrupo_principal sp ON sp.cod_gran_grupo = gg.cod_gran_grupo
LEFT   JOIN cuoc_subgrupo           sg ON sg.cod_subgrupo_p = sp.cod_subgrupo_p
LEFT   JOIN cuoc_grupo_primario     gp ON gp.cod_subgrupo_c = sg.cod_subgrupo_c
LEFT   JOIN cuoc_ocupacion          o  ON o.cod_grupo_prim  = gp.cod_grupo_prim AND o.id_comparativa IS NULL
GROUP  BY gg.cod_gran_grupo, gg.nom_gran_grupo
ORDER  BY gg.cod_gran_grupo;

SELECT n.cod_nivel, n.nombre_nivel, COUNT(o.cod_ocupacion_cuoc) AS ocupaciones
FROM   cuoc_nivel_competencia n
LEFT   JOIN cuoc_ocupacion o ON o.cod_nivel_cuoc = n.cod_nivel AND o.id_comparativa IS NULL
WHERE  n.es_copia = false
GROUP  BY n.cod_nivel, n.nombre_nivel
ORDER  BY n.cod_nivel;

SELECT ac.codigo, ac.descripcion, COUNT(o.cod_ocupacion_cuoc) AS ocupaciones
FROM   cuoc_area_cualificacion ac
LEFT   JOIN cuoc_ocupacion o ON o.codigo_area_cuoc = ac.codigo AND o.id_comparativa IS NULL
GROUP  BY ac.codigo, ac.descripcion
ORDER  BY ac.codigo;


-- 9. Controles de calidad ------------------------------------------------------
-- 9.1 Ocupaciones sin denominaciones activas
SELECT o.cod_ocupacion_cuoc, o.nom_ocupacion_cuoc
FROM   cuoc_ocupacion o
WHERE  o.id_comparativa IS NULL
  AND  NOT EXISTS (SELECT 1 FROM cuoc_denominacion d
                   WHERE d.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc AND d.estado = 1)
ORDER  BY o.cod_ocupacion_cuoc;

-- 9.2 Ocupaciones sin funciones
SELECT o.cod_ocupacion_cuoc, o.nom_ocupacion_cuoc
FROM   cuoc_ocupacion o
WHERE  o.id_comparativa IS NULL
  AND  NOT EXISTS (SELECT 1 FROM cuoc_funciones f WHERE f.cod_ocupacion_cuoc = o.cod_ocupacion_cuoc)
ORDER  BY o.cod_ocupacion_cuoc;

-- 9.3 Denominaciones sin nombre
SELECT cod_denominacion, cod_ocupacion_cuoc
FROM   cuoc_denominacion
WHERE  nom_denominacion IS NULL OR btrim(nom_denominacion) = ''
ORDER  BY cod_denominacion;

-- 9.4 Ocupaciones CUOC sin correlativa CNO
SELECT o.cod_ocupacion_cuoc, o.nom_ocupacion_cuoc
FROM   cuoc_ocupacion o
WHERE  o.id_comparativa IS NULL
  AND  NOT EXISTS (SELECT 1 FROM correlativa_ocupacion co WHERE co.cuoc_ocupacion_cuoc = o.cod_ocupacion_cuoc)
ORDER  BY o.cod_ocupacion_cuoc;


-- 10. Copias creadas desde Análisis -------------------------------------------
SELECT o.cod_ocupacion_cuoc, o.nom_ocupacion_cuoc, o.cod_ante_ocupacion_cuoc AS original,
       o.id_comparativa, c.descripcion AS comparativa, c.estado, c.fecha_registro
FROM   cuoc_ocupacion o
LEFT   JOIN comparativa_ocupacion c ON c.codigo = o.id_comparativa
WHERE  o.id_comparativa IS NOT NULL
ORDER  BY o.id_comparativa, o.cod_ocupacion_cuoc;
