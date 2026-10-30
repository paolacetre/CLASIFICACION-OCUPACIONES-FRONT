-- =============================================================================
-- Consultas CNO (Clasificación Nacional de Ocupaciones)
-- Esquema: clasificacion  ·  Solo lectura (SELECT), no modifica datos.
--
-- Uso:
--   docker exec -i clasificacion_bd psql -U postgres -d clasificacion \
--     < back/database/consultas/consultas_cno.sql
--   o copiar la consulta que se necesite en pgAdmin / DBeaver.
--
-- Para filtrar por una ocupación concreta cambia el valor de :'ocup'
-- (psql) o reemplaza '0011' directamente en el WHERE.
--
-- Nota: las filas con id_comparativa NOT NULL son copias creadas desde
-- Análisis; el catálogo original es id_comparativa IS NULL.
-- =============================================================================

SET search_path TO clasificacion, public;
\set ocup '0011'


-- 1. Resumen: cantidad de registros por tabla CNO -----------------------------
SELECT 'cno_area_desempeno'      AS tabla, COUNT(*) AS total FROM cno_area_desempeno
UNION ALL SELECT 'cno_nivel_cualificacion', COUNT(*) FROM cno_nivel_cualificacion
UNION ALL SELECT 'cno_ocupacion (original)', COUNT(*) FROM cno_ocupacion WHERE id_comparativa IS NULL
UNION ALL SELECT 'cno_ocupacion (copias)',   COUNT(*) FROM cno_ocupacion WHERE id_comparativa IS NOT NULL
UNION ALL SELECT 'cno_denominacion',        COUNT(*) FROM cno_denominacion
UNION ALL SELECT 'cno_funcion',             COUNT(*) FROM cno_funcion
UNION ALL SELECT 'cno_reg_funciones',       COUNT(*) FROM cno_reg_funciones
UNION ALL SELECT 'cno_conocimiento',        COUNT(*) FROM cno_conocimiento
UNION ALL SELECT 'cno_reg_conocimiento',    COUNT(*) FROM cno_reg_conocimiento
UNION ALL SELECT 'cno_reg_habilidad',       COUNT(*) FROM cno_reg_habilidad
UNION ALL SELECT 'cno_relacionadas',        COUNT(*) FROM cno_relacionadas;


-- 2. Catálogos base ------------------------------------------------------------
SELECT cod_desempeno, nom_desempeno, descripcion
FROM   cno_area_desempeno
ORDER  BY cod_desempeno;

SELECT cod_cualificacion, niveles_cualificacion, es_copia, cod_original
FROM   cno_nivel_cualificacion
ORDER  BY es_copia, cod_cualificacion;


-- 3. Listado de ocupaciones del catálogo original con área y nivel ------------
SELECT o.cod_ocupacion_cno,
       o.nomb_ocupacion_cno,
       a.cod_desempeno,
       a.nom_desempeno,
       n.cod_cualificacion,
       n.niveles_cualificacion,
       o.estado,
       o.fecha_registro
FROM   cno_ocupacion o
LEFT   JOIN cno_area_desempeno      a ON a.cod_desempeno     = o.cod_desempeno_cno
LEFT   JOIN cno_nivel_cualificacion n ON n.cod_cualificacion = o.cod_cualificacion_cno
WHERE  o.id_comparativa IS NULL
ORDER  BY o.cod_ocupacion_cno;


-- 4. Ficha completa de una ocupación ------------------------------------------
SELECT o.*, a.nom_desempeno AS area, n.niveles_cualificacion AS nivel
FROM   cno_ocupacion o
LEFT   JOIN cno_area_desempeno      a ON a.cod_desempeno     = o.cod_desempeno_cno
LEFT   JOIN cno_nivel_cualificacion n ON n.cod_cualificacion = o.cod_cualificacion_cno
WHERE  o.cod_ocupacion_cno = :'ocup';

-- 4.1 Denominaciones
SELECT cod_denominacion_cno, desc_denominacion, estado, fecha_reg, fecha_inactivacion
FROM   cno_denominacion
WHERE  cno_cod_ocupacion = :'ocup'
ORDER  BY cod_denominacion_cno;

-- 4.2 Funciones
SELECT rf.codigo, rf.cod_funcion, COALESCE(rf.desc_funcion_cno, f.desc_funcion_cno) AS funcion, rf.estado
FROM   cno_reg_funciones rf
LEFT   JOIN cno_funcion f ON f.cod_funcion = rf.cod_funcion
WHERE  rf.cno_ocupacion = :'ocup'
ORDER  BY rf.codigo;

-- 4.3 Conocimientos
SELECT rc.cod_conocimiento, COALESCE(rc.nomb_conocimiento, c.nomb_conocimiento) AS conocimiento
FROM   cno_reg_conocimiento rc
LEFT   JOIN cno_conocimiento c ON c.cod_conocimiento = rc.cod_conocimiento
WHERE  rc.cod_ocupacion_cno = :'ocup'
ORDER  BY rc.cod_conocimiento;

-- 4.4 Habilidades y destrezas
SELECT rh.codigo_habilidad, COALESCE(rh.nomb_hab_dest, h.nomb_hab_dest) AS habilidad
FROM   cno_reg_habilidad rh
LEFT   JOIN habilidad_destreza h ON h.cod_hab_dest = rh.codigo_habilidad
WHERE  rh.cod_ocupacion_cno = :'ocup'
ORDER  BY rh.codigo_habilidad;

-- 4.5 Ocupaciones relacionadas
SELECT codigo_ocupacion, nombre_cno_relacionada
FROM   cno_relacionadas
WHERE  cod_ocupacion_cno = :'ocup'
ORDER  BY codigo_ocupacion;

-- 4.6 Correlativa hacia CUOC
SELECT co.cuoc_ocupacion_cuoc, co.nomb_ocupacion_cuoc, co.observacion
FROM   correlativa_ocupacion co
WHERE  co.cno_ocupacion_cno = :'ocup'
ORDER  BY co.cuoc_ocupacion_cuoc;


-- 5. Búsqueda por texto (sin tildes) en ocupaciones y denominaciones ----------
\set texto 'gerente'
SELECT DISTINCT o.cod_ocupacion_cno, o.nomb_ocupacion_cno, d.desc_denominacion
FROM   cno_ocupacion o
LEFT   JOIN cno_denominacion d ON d.cno_cod_ocupacion = o.cod_ocupacion_cno
WHERE  o.id_comparativa IS NULL
  AND (   public.unaccent(o.nomb_ocupacion_cno) ILIKE '%' || public.unaccent(:'texto') || '%'
       OR public.unaccent(d.desc_denominacion)  ILIKE '%' || public.unaccent(:'texto') || '%')
ORDER  BY o.cod_ocupacion_cno;


-- 6. Totales por ocupación (denominaciones, funciones, conocimientos, habilidades)
SELECT o.cod_ocupacion_cno,
       o.nomb_ocupacion_cno,
       (SELECT COUNT(*) FROM cno_denominacion     d WHERE d.cno_cod_ocupacion = o.cod_ocupacion_cno) AS denominaciones,
       (SELECT COUNT(*) FROM cno_reg_funciones    f WHERE f.cno_ocupacion     = o.cod_ocupacion_cno) AS funciones,
       (SELECT COUNT(*) FROM cno_reg_conocimiento c WHERE c.cod_ocupacion_cno = o.cod_ocupacion_cno) AS conocimientos,
       (SELECT COUNT(*) FROM cno_reg_habilidad    h WHERE h.cod_ocupacion_cno = o.cod_ocupacion_cno) AS habilidades,
       (SELECT COUNT(*) FROM cno_relacionadas     r WHERE r.cod_ocupacion_cno = o.cod_ocupacion_cno) AS relacionadas
FROM   cno_ocupacion o
WHERE  o.id_comparativa IS NULL
ORDER  BY o.cod_ocupacion_cno;


-- 7. Ocupaciones por área de desempeño y por nivel de cualificación -----------
SELECT a.cod_desempeno, a.nom_desempeno, COUNT(o.cod_ocupacion_cno) AS ocupaciones
FROM   cno_area_desempeno a
LEFT   JOIN cno_ocupacion o ON o.cod_desempeno_cno = a.cod_desempeno AND o.id_comparativa IS NULL
GROUP  BY a.cod_desempeno, a.nom_desempeno
ORDER  BY a.cod_desempeno;

SELECT n.cod_cualificacion, n.niveles_cualificacion, COUNT(o.cod_ocupacion_cno) AS ocupaciones
FROM   cno_nivel_cualificacion n
LEFT   JOIN cno_ocupacion o ON o.cod_cualificacion_cno = n.cod_cualificacion AND o.id_comparativa IS NULL
WHERE  n.es_copia = false
GROUP  BY n.cod_cualificacion, n.niveles_cualificacion
ORDER  BY n.cod_cualificacion;


-- 8. Controles de calidad ------------------------------------------------------
-- 8.1 Ocupaciones sin denominaciones
SELECT o.cod_ocupacion_cno, o.nomb_ocupacion_cno
FROM   cno_ocupacion o
WHERE  o.id_comparativa IS NULL
  AND  NOT EXISTS (SELECT 1 FROM cno_denominacion d WHERE d.cno_cod_ocupacion = o.cod_ocupacion_cno)
ORDER  BY o.cod_ocupacion_cno;

-- 8.2 Ocupaciones sin funciones
SELECT o.cod_ocupacion_cno, o.nomb_ocupacion_cno
FROM   cno_ocupacion o
WHERE  o.id_comparativa IS NULL
  AND  NOT EXISTS (SELECT 1 FROM cno_reg_funciones f WHERE f.cno_ocupacion = o.cod_ocupacion_cno)
ORDER  BY o.cod_ocupacion_cno;

-- 8.3 Denominaciones sin nombre
SELECT cod_denominacion_cno, cno_cod_ocupacion
FROM   cno_denominacion
WHERE  desc_denominacion IS NULL OR btrim(desc_denominacion) = ''
ORDER  BY cod_denominacion_cno;

-- 8.4 Ocupaciones CNO sin correlativa CUOC
SELECT o.cod_ocupacion_cno, o.nomb_ocupacion_cno
FROM   cno_ocupacion o
WHERE  o.id_comparativa IS NULL
  AND  NOT EXISTS (SELECT 1 FROM correlativa_ocupacion co WHERE co.cno_ocupacion_cno = o.cod_ocupacion_cno)
ORDER  BY o.cod_ocupacion_cno;


-- 9. Copias creadas desde Análisis --------------------------------------------
SELECT o.cod_ocupacion_cno, o.nomb_ocupacion_cno, o.cod_ante_ocupacion_cno AS original,
       o.id_comparativa, c.descripcion AS comparativa, c.estado, c.fecha_registro
FROM   cno_ocupacion o
LEFT   JOIN comparativa_ocupacion c ON c.codigo = o.id_comparativa
WHERE  o.id_comparativa IS NOT NULL
ORDER  BY o.id_comparativa, o.cod_ocupacion_cno;
