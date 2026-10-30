-- ============================================================
--  022_extension_unaccent
--
--  Los buscadores comparaban con ILIKE, que distingue tildes: "tecnico"
--  encontraba 0 ocupaciones CNO y "técnico" 41; "electrico" 0 y "eléctrico"
--  4 en CUOC. Casi nadie escribe tildes al buscar. `unaccent` permite
--  comparar sin ellas (ver common/utils/busqueda-texto.util.ts).
--
--  Va en `public` porque la conexión de la app usa
--  search_path=clasificacion,public.
--
--  Idempotente. Sin BEGIN/COMMIT: el runner envuelve el archivo.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
