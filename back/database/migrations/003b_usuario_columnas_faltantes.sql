-- ============================================================
--  003b_usuario_columnas_faltantes
--
--  Numerada 003b y no 008 a proposito: 004_usuarios_prueba hace UPDATE sobre
--  nombre/apellido/correo y revienta si no existen, asi que esta tiene que
--  correr ANTES. El runner aplica los pendientes en orden alfabetico de
--  nombre de archivo, y "003_" < "003b" < "004_".
--
--  Cierra el hueco que dejó 001_fix_schema_drift en la tabla `usuario`.
--
--  Qué pasó: 001 alineó el esquema de dos maneras — ADD COLUMN para las tablas
--  con datos, y DROP/CREATE para las tablas vacías con estructura antigua.
--  `usuario` no entra en ninguna de las dos: tiene cuentas reales (así que no
--  se puede recrear) y nadie la añadió a la lista de ALTER. Resultado: las
--  columnas que el esquema fue ganando después del dump original nunca
--  llegaron a las BD ya desplegadas.
--
--    - nombre / apellido / correo   → añadidas en 5702f73 (formulario de
--                                     creación de usuarios).
--    - origen                       → añadida en f19e405 (importación de
--                                     usuarios desde Excel).
--
--  Síntoma: `usuario.entity.ts` declara las cuatro y DB_SYNCHRONIZE=false, así
--  que TypeORM las pide en cada SELECT y Postgres rechaza la consulta al
--  parsearla — antes de mirar una sola fila. El login devolvía 500 con
--  "column Usuario.origen does not exist" incluso con la tabla llena de
--  cuentas válidas. SeedService (INSERT ... origen) tenía el mismo fallo
--  latente: solo se libraba porque las cuentas ya existían y tomaba la rama
--  que salta el INSERT.
--
--  Por qué las cuatro y no solo `origen`: cada BD desplegada quedó congelada
--  en un punto distinto de esa secuencia según cuándo se recreó su volumen.
--  `ADD COLUMN IF NOT EXISTS` sobre las cuatro deja cualquiera de esos puntos
--  en el mismo estado, sin tener que averiguar en cuál está cada una.
--
--  No borra ni desactiva ninguna cuenta: las que se registraron durante las
--  pruebas se conservan tal cual y Postgres las marca como MANUAL, que es
--  exactamente lo que son.
--
--  Idempotente: sobre una BD ya alineada (o recién creada desde
--  init/01-schema.sql, que ya trae las cuatro) no hace nada.
--  NO lleva BEGIN/COMMIT: el runner (scripts/db-migrate.js) envuelve cada
--  archivo en su propia transacción.
-- ============================================================

SET search_path TO clasificacion;

-- ── 1. Columnas que faltan ──────────────────────────────────
--  Tipos copiados literalmente de init/01-schema.sql para que una BD migrada
--  y una recién creada queden idénticas.
--
--  El DEFAULT de `origen` no es decorativo: Postgres rellena con él las filas
--  que ya existen, así que las cuentas previas quedan como MANUAL en vez de
--  NULL y `GET /usuarios?origen=MANUAL` las devuelve igual que en una BD nueva.
ALTER TABLE clasificacion.usuario
  ADD COLUMN IF NOT EXISTS nombre   VARCHAR(100) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS apellido VARCHAR(100) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS correo   VARCHAR(255) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS origen   VARCHAR(50)  DEFAULT 'MANUAL';

-- ── 2. Marcar como SEED las cuentas de prueba ───────────────
--  En una BD nueva las crea SeedService con origen='SEED' (seed.service.ts).
--  En una BD ya desplegada existían antes de que la columna existiera, así que
--  el paso 1 las dejó en MANUAL. Sin esto, filtrar por origen daría resultados
--  distintos según cómo nació cada BD.
--  Se filtra por el identificador de login, que es único (ux_usuario_usuario,
--  creado en 004_usuarios_prueba).
UPDATE clasificacion.usuario
SET origen = 'SEED'
WHERE usuario IN (
  'admin@sena.edu.co',
  'prueba.analista@sena.edu.co',
  'experto@sena.edu.co',
  'ciudadano@sena.edu.co',
  'ape@sena.edu.co',
  'tendencias@sena.edu.co'
)
AND origen IS DISTINCT FROM 'SEED';
