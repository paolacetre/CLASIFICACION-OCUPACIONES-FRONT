# Base de datos — esquema y migraciones

## Fuente de verdad

`init/01-schema.sql` es la estructura completa del esquema `clasificacion`.
`init/02-seed.sql` siembra lo mínimo para arrancar (roles, usuarios de prueba,
`usuario_roles`). **No** siembra el catálogo CNO/CUOC.

El catálogo **CNO** lo siembra el backend al arrancar desde
`siembra/cno.xlsx` (hoy, el libro `CNO_2026_10-09Actualizado`), con la misma
carga de Actualización: crea lo que falte y actualiza lo que cambió, sin borrar.
Se aplica una vez por versión del archivo (guarda su hash en
`configuracion_sistema`, clave `siembra_cno`), así que también actualiza un
despliegue que ya tenía datos. Para publicar un libro nuevo basta con
reemplazar `siembra/cno.xlsx` y desplegar. Se desactiva con `SIEMBRA_CNO=false`.
Ver `src/modules/seed/siembra-cno.service.ts`.

Docker solo ejecuta `init/*.sql` **cuando el cluster está vacío**
(`/docker-entrypoint-initdb.d`). Una BD ya creada nunca vuelve a leer esos
archivos: los cambios de estructura posteriores van como **migraciones**.

## Migraciones

Carpeta `migrations/`, archivos `NNN_nombre.sql` en orden. Reglas:

- **Idempotentes**: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
  etc. Deben poder correr sobre una BD recién creada desde `01-schema.sql`
  (donde son no-op) y sobre una BD vieja (donde aplican el cambio).
- **Sin `BEGIN`/`COMMIT`**: el runner (`scripts/db-migrate.js`) envuelve cada
  archivo en su propia transacción y lo registra en `clasificacion._migrations`.
- Si un cambio no se puede hacer sin perder datos, la migración debe **abortar
  con un mensaje claro** en vez de destruir.

### Correr

```bash
npm run db:migrate         # aplica las pendientes
npm run db:migrate:check   # solo lista pendientes (exit 1 si hay) — para CI
```

`npm run dev` (vía `scripts/start-dev.ps1`) las aplica automáticamente antes de
levantar NestJS. Si fallan, la app **no arranca**.

### Añadir una migración

1. Crea `migrations/00X_descripcion.sql` (idempotente, sin transacción).
2. Si añade columnas/tablas nuevas, refléjalas también en `init/01-schema.sql`
   para que una BD creada de cero ya nazca correcta.
3. `npm run db:migrate` y verifica.

## Por qué existe esto (incidente 2026-09-03)

El volumen `api-clasificacion_pgdata` se creó desde un dump anterior al commit
`4c572f0` (2026-08-12) y nunca se migró. Las entidades TypeORM
(`DB_SYNCHRONIZE=false`) pedían columnas que la BD no tenía
(`cno_ocupacion.campo_ocup_cno`, tablas `pregunta` / `pregunta_respuesta` /
`respuestas_copy1`, columnas nuevas en `instrumento` / `comparativa_ocupacion`…),
así que **todos los endpoints de datos respondían HTTP 500**.

Migraciones del incidente:

- `001_fix_schema_drift` — columnas y tablas que faltaban.
- `002_cno_reg_funciones_codigo_text` — `cno_reg_funciones.codigo` había quedado
  como `integer`; el código guarda claves de texto (`0011-7-F1`).
- `003_resync_sequences` — los catálogos se cargaron con IDs explícitos sin
  avanzar las secuencias `SERIAL`; el primer `INSERT` autogenerado chocaba
  (`duplicate key ... cno_conocimiento_pkey`). Reposiciona todas las secuencias
  del esquema a `MAX(columna)`.

El runner evita que este tipo de desfase vuelva a pasar sin avisar.

## Recuperación manual

Ver el estado real de una tabla:

```bash
docker exec -it clasificacion_bd psql -U postgres -d clasificacion \
  -c "\d clasificacion.cno_ocupacion"
```

Reconstruir la BD desde cero (⚠️ borra el catálogo CNO/CUOC; hay que re-importarlo
con los scripts `scripts/import-*.js`):

```bash
docker compose down -v          # ojo: el volumen es external, ver docker-compose.yml
docker compose up -d db         # re-ejecuta init/*.sql
npm run db:migrate
```
