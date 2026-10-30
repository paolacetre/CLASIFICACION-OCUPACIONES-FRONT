# API Clasificación de Ocupaciones (CUOC)

API REST para gestionar la **Clasificación Nacional de Ocupaciones (CNO)** y la **Clasificación Única de Ocupaciones para Colombia (CUOC)**. Facilita el almacenamiento, consulta, correlación y análisis de ocupaciones, áreas de desempeño, conocimientos y habilidades mediante una base de datos relacional PostgreSQL.

## Stack Tecnológico

| Tecnología | Versión | Propósito |
|---|---|---|
| **NestJS** | 10.x | Framework backend modular con inyección de dependencias |
| **TypeScript** | 5.x | Tipado estático y autocompletado |
| **TypeORM** | 0.3.x | ORM con decoradores para entidades y migraciones |
| **PostgreSQL** | 15 | Base de datos relacional (corre en Docker) |
| **Docker Compose** | 2.x | Orquestación del contenedor de base de datos |

## Requisitos Previos

- Node.js >= 18.x
- npm >= 9.x
- Docker Desktop >= 24.x (con Docker Compose incluido)

---

## Inicio Rápido

### Paso 1 — Clonar y configurar variables de entorno

```bash
git clone <url-del-repositorio>
cd api-clasificacion
```

Copia el archivo de ejemplo y ajústalo si es necesario:

```bash
cp .env.example .env
```

> **Nota:** Los valores por defecto del `.env.example` ya están configurados para funcionar con el `docker-compose.yml` incluido. Para desarrollo local no necesitas cambiar nada.

### Paso 2 — Levantar la base de datos con Docker

Asegúrate de que **Docker Desktop** esté corriendo (ícono verde en la barra de tareas), luego:

```bash
docker-compose up -d
```

Esto crea el contenedor `clasificacion_postgres` con PostgreSQL 15 y ejecuta automáticamente el script `database/init/01-schema.sql` que crea las **35 tablas con 44 foreign keys**.

### Paso 3 — Instalar dependencias

```bash
npm install
```

### Paso 4 — Iniciar la aplicación

**Opción A — Script automatizado (recomendado en Windows):**

```powershell
npm run dev
```

Este comando ejecuta `scripts/start-dev.ps1` que automáticamente:
1. Verifica/abre Docker Desktop si no está corriendo
2. Levanta el contenedor de PostgreSQL
3. Espera a que PostgreSQL acepte conexiones
4. Instala dependencias si faltan
5. Inicia NestJS en modo watch

**Opción B — Manual (cualquier OS):**

```bash
docker-compose up -d        # Levantar PostgreSQL
npm run start:dev            # Iniciar NestJS en modo watch
```

### Paso 5 — Verificar

La API estará disponible en: **http://localhost:3000**

```bash
# Verificar que las 35 tablas se crearon
docker exec clasificacion_postgres psql -U postgres -d clasificacion -c "\dt"

# Verificar las 44 foreign keys
docker exec clasificacion_postgres psql -U postgres -d clasificacion -c "SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY';"
```

---

## Variables de Entorno

La aplicación usa un archivo **`.env`** en la raíz del proyecto para toda su configuración. NestJS lo carga automáticamente mediante `ConfigModule.forRoot()`.

> **⚠️ Importante:** El archivo `.env` contiene credenciales y **nunca debe subirse al repositorio**. Está incluido en el `.gitignore`. El archivo `.env.example` es la plantilla que SÍ se versiona.

### Variables actuales

| Variable | Descripción | Valor por defecto | Usado en |
|---|---|---|---|
| `NODE_ENV` | Ambiente de ejecución | `development` | General |
| `APP_PORT` | Puerto donde escucha la API | `3000` | `main.ts` |
| `DB_HOST` | Host de PostgreSQL | `localhost` | `database.config.ts` |
| `DB_PORT` | Puerto de PostgreSQL | `5433` | `database.config.ts` |
| `DB_USERNAME` | Usuario de la base de datos | `postgres` | `database.config.ts` |
| `DB_PASSWORD` | Contraseña de la base de datos | `tu_password_seguro` | `database.config.ts` |
| `DB_DATABASE` | Nombre de la base de datos | `clasificacion` | `database.config.ts` |
| `DB_SYNCHRONIZE` | Auto-sincronizar entidades con la BD | `true` | `database.config.ts` |

### Relación `.env` ↔ Docker

Los valores del `.env` deben coincidir con los del `docker-compose.yml`:

```
.env                          docker-compose.yml
─────────────────────         ─────────────────────────────
DB_USERNAME=postgres     ←→   POSTGRES_USER: postgres
DB_PASSWORD=tu_password_seguro ←→   POSTGRES_PASSWORD: tu_password_seguro
DB_DATABASE=clasificacion ←→  POSTGRES_DB: clasificacion
DB_PORT=5433             ←→   ports: '5433:5432'
DB_HOST=localhost        ←→   (conexión externa al contenedor)
```

> **¿Por qué el puerto es 5433?** Para evitar conflicto con instalaciones locales de PostgreSQL que usan el puerto estándar 5432.

---

## Configuración de Docker

### docker-compose.yml

```yaml
services:
  db:
    image: postgres:15-alpine
    container_name: clasificacion_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: tu_password_seguro
      POSTGRES_DB: clasificacion
      POSTGRES_HOST_AUTH_METHOD: trust
      POSTGRES_INITDB_ARGS: "--auth-host=trust"
    ports:
      - '5433:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d
    restart: unless-stopped
```

### Inicialización Automática

Al ejecutar `docker-compose up -d` por primera vez, Docker:
1. Descarga la imagen `postgres:15-alpine` (~100 MB)
2. Crea el contenedor `clasificacion_postgres`
3. Crea la base de datos `clasificacion`
4. Ejecuta automáticamente `database/init/01-schema.sql` (crea las 35 tablas con todas sus FK)
5. El volumen `pgdata` persiste los datos entre reinicios

---

## Arquitectura de Carpetas

El proyecto utiliza una **arquitectura modular por dominios (Domain-Driven Modular Architecture)**. Cada dominio de negocio vive en su propio módulo con entidades, DTOs, servicios y controladores aislados.

```text
api-clasificacion/
├── .env                                # Variables de entorno (NO se sube al repo)
├── .env.example                        # Plantilla de variables (SÍ se sube al repo)
├── .gitignore                          # Archivos excluidos del repositorio
├── database/
│   └── init/
│       └── 01-schema.sql              # Script PostgreSQL (35 tablas + 44 FK)
├── scripts/
│   └── start-dev.ps1                  # Script automatizado de inicio (Windows)
├── src/
│   ├── config/
│   │   ├── database.config.ts          # Configuración centralizada de PostgreSQL
│   │   └── index.ts                    # Barrel export
│   ├── common/
│   │   └── filters/
│   │       └── http-exception.filter.ts # Interceptor global de errores
│   ├── modules/
│   │   ├── cno/                        # 🔵 Dominio CNO (9 entidades)
│   │   │   ├── entities/
│   │   │   │   ├── cno-area.entity.ts
│   │   │   │   ├── cno-area-desempeno.entity.ts
│   │   │   │   ├── cno-conocimiento.entity.ts
│   │   │   │   ├── cno-nivel-cualificacion.entity.ts
│   │   │   │   ├── cno-ocupacion.entity.ts
│   │   │   │   ├── cno-denominacion.entity.ts
│   │   │   │   ├── cno-funcion.entity.ts
│   │   │   │   ├── cno-habilidad.entity.ts
│   │   │   │   ├── cno-relacionada.entity.ts
│   │   │   │   └── index.ts
│   │   │   └── cno.module.ts
│   │   ├── cuoc/                       # 🟢 Dominio CUOC (12 entidades)
│   │   │   ├── entities/
│   │   │   │   ├── cuoc-gran-grupo.entity.ts
│   │   │   │   ├── cuoc-subgrupo-principal.entity.ts
│   │   │   │   ├── cuoc-subgrupo.entity.ts
│   │   │   │   ├── cuoc-grupo-primario.entity.ts
│   │   │   │   ├── cuoc-nivel-competencia.entity.ts
│   │   │   │   ├── cuoc-ocupacion.entity.ts
│   │   │   │   ├── cuoc-denominacion.entity.ts
│   │   │   │   ├── cuoc-funcion.entity.ts
│   │   │   │   ├── cuoc-area-cualificacion.entity.ts
│   │   │   │   ├── cuoc-conocimiento.entity.ts
│   │   │   │   ├── cuoc-reg-conocimiento.entity.ts
│   │   │   │   ├── cuoc-destreza.entity.ts
│   │   │   │   └── index.ts
│   │   │   └── cuoc.module.ts
│   │   ├── shared/                     # 🟡 Entidades compartidas (1 entidad)
│   │   │   ├── entities/
│   │   │   │   ├── habilidad-destreza.entity.ts
│   │   │   │   └── index.ts
│   │   │   └── shared.module.ts
│   │   ├── correlativa/                # 🟠 Tablas correlativas CNO↔CUOC (2 entidades)
│   │   │   ├── entities/
│   │   │   │   ├── correlativa.entity.ts
│   │   │   │   ├── correlativa-conocimiento.entity.ts
│   │   │   │   └── index.ts
│   │   │   └── correlativa.module.ts
│   │   ├── encuesta/                   # 🔴 Módulo de encuestas (7 entidades)
│   │   │   ├── entities/
│   │   │   │   ├── mesa.entity.ts
│   │   │   │   ├── comparativa.entity.ts
│   │   │   │   ├── ocupacion-encuesta.entity.ts
│   │   │   │   ├── comparativa-ocupacion.entity.ts
│   │   │   │   ├── pregunta.entity.ts
│   │   │   │   ├── instrumento.entity.ts
│   │   │   │   ├── respuesta.entity.ts
│   │   │   │   └── index.ts
│   │   │   └── encuesta.module.ts
│   │   ├── usuario/                    # 🟣 Gestión de usuarios (1 entidad)
│   │   │   ├── entities/
│   │   │   │   ├── usuario.entity.ts
│   │   │   │   └── index.ts
│   │   │   └── usuario.module.ts
│   │   └── geografia/                  # 🔵 Datos geográficos (3 entidades)
│   │       ├── entities/
│   │       │   ├── departamento.entity.ts
│   │       │   ├── ciudad.entity.ts
│   │       │   ├── sector.entity.ts
│   │       │   └── index.ts
│   │       └── geografia.module.ts
│   ├── app.module.ts                   # Módulo raíz — orquesta todos los módulos
│   └── main.ts                         # Punto de entrada — CORS, validaciones, filtros
├── docker-compose.yml                  # PostgreSQL 15 en puerto 5433
├── package.json
└── tsconfig.json
```

### Tipo de Encarpetado: **Arquitectura Modular por Dominios (Domain-Driven Modular)**

| Característica | Descripción |
|---|---|
| **Principio** | Cada módulo encapsula un dominio de negocio completo |
| **Escalabilidad** | Nuevos dominios se agregan como carpetas independientes en `modules/` |
| **Mantenibilidad** | Cambios en un dominio no afectan otros módulos |
| **Reutilización** | El módulo `shared/` centraliza entidades comunes entre dominios |
| **Convención** | Un archivo `index.ts` (barrel export) en cada carpeta `entities/` |

---

## Base de Datos — 35 Tablas · 44 Foreign Keys · 7 Módulos

### Resumen por Módulo

| Módulo | Tablas | FK | Descripción |
|---|---|---|---|
| `cno` | 9 | 11 | Clasificación Nacional de Ocupaciones |
| `cuoc` | 12 | 11 | Clasificación Única de Ocupaciones para Colombia |
| `shared` | 1 | 0 | Habilidades/destrezas compartidas (catálogo) |
| `correlativa` | 2 | 4 | Tablas de correlación CNO ↔ CUOC |
| `encuesta` | 7 | 13 | Comparativas, instrumentos, preguntas, respuestas |
| `usuario` | 1 | 0 | Gestión de usuarios |
| `geografia` | 3 | 5 | Departamentos, ciudades, sectores |
| **Total** | **35** | **44** | |

### Detalle de Foreign Keys por Tabla

#### Dominio CNO

| Tabla | Columna FK | Referencia |
|---|---|---|
| `cno_area_desempeno` | `cno_area_cod_area` | → `cno_area.cod_area` |
| `cno_ocupacion` | `cod_desempeno` | → `cno_area_desempeno.cod_desempeno` |
| `cno_ocupacion` | `cod_cualificacion` | → `cno_nivel_cualificacion.cod_cualificacion` |
| `cno_ocupacion` | `cno_conocimientos_cod_conocimiento` | → `cno_conocimiento.cod_conocimiento` |
| `cno_denominacion` | `cod_ocupacion_cno` | → `cno_ocupacion.cod_ocupacion_cno` |
| `cno_funciones` | `cod_ocupacion_cno` | → `cno_ocupacion.cod_ocupacion_cno` |
| `cno_habilidad` | `cod_habilidad` | → `habilidad_destreza.cod_hab_dest` |
| `cno_habilidad` | `cod_ocupacion_cno` | → `cno_ocupacion.cod_ocupacion_cno` |
| `cno_relacionadas` | `cod_ocupacion_cno` | → `cno_ocupacion.cod_ocupacion_cno` |
| `cno_relacionadas` | `cod_ocupacion_relacionada` | → `cno_ocupacion.cod_ocupacion_cno` |

#### Dominio CUOC

| Tabla | Columna FK | Referencia |
|---|---|---|
| `cuoc_subgrupo_principal` | `cod_gran_grupo` | → `cuoc_gran_grupo.cod_gran_grupo` |
| `cuoc_subgrupo` | `cod_subgrupo_p` | → `cuoc_subgrupo_principal.cod_subgrupo_p` |
| `cuoc_grupo_primario` | `cod_subgrupo_c` | → `cuoc_subgrupo.cod_subgrupo_c` |
| `cuoc_ocupacion` | `cod_grupo_prim` | → `cuoc_grupo_primario.cod_grupo_prim` |
| `cuoc_ocupacion` | `cod_niveles_com` | → `cuoc_nivel_competencia.cod_niveles_com` |
| `cuoc_denominacion` | `cod_ocupacion_cuoc` | → `cuoc_ocupacion.cod_ocupacion_cuoc` |
| `cuoc_funciones` | `cod_ocupacion_cuoc` | → `cuoc_ocupacion.cod_ocupacion_cuoc` |
| `cuoc_area_cualificacion` | `cod_ocupacion_cuoc` | → `cuoc_ocupacion.cod_ocupacion_cuoc` |
| `cuoc_reg_conocimientos` | `cod_ocupacion_cuoc` | → `cuoc_ocupacion.cod_ocupacion_cuoc` |
| `cuoc_reg_conocimientos` | `cod_conocimiento` | → `cuoc_conocimiento.cod_conocimiento` |
| `cuoc_destreza` | `cod_hab_dest` | → `habilidad_destreza.cod_hab_dest` |
| `cuoc_destreza` | `cod_ocupacion_cuoc` | → `cuoc_ocupacion.cod_ocupacion_cuoc` |

#### Correlativas

| Tabla | Columna FK | Referencia |
|---|---|---|
| `correlativa` | `cod_denominacion_cno` | → `cno_denominacion.cod_denominacion` |
| `correlativa` | `cod_denominacion_cuoc` | → `cuoc_denominacion.cod_denominacion` |
| `correlativa_conocimientos` | `cod_conocimiento_cno` | → `cno_conocimiento.cod_conocimiento` |
| `correlativa_conocimientos` | `cod_conocimiento_cuoc` | → `cuoc_conocimiento.cod_conocimiento` |

#### Encuesta / Geografía / Usuarios

| Tabla | Columna FK | Referencia |
|---|---|---|
| `comparativa_ocupacion` | `comparativa_codigo` | → `comparativa.codigo` |
| `comparativa_ocupacion` | `ocupacion_codigo` | → `ocupacion.codigo` |
| `instrumento` | `comparativa_ocupacion_*` (compuesta) | → `comparativa_ocupacion (PK compuesta)` |
| `instrumento` | `preguntas_id_pregunta` | → `preguntas.id_pregunta` |
| `ciudad` | `departamento_codigo` | → `departamento.codigo` |
| `respuestas` | `usuario_id_usuario` | → `usuario.id_usuario` |
| `respuestas` | `instrumento_idinstrumento` | → `instrumento.idinstrumento` |
| `respuestas` | `departamento_codigo` | → `departamento.codigo` |
| `respuestas` | `ciudad_codigo` | → `ciudad.codigo` |
| `respuestas` | `sector_codigo` | → `sector.codigo` |

### Diagrama de Relaciones

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  cno_area    │────▶│ cno_area_desem.  │────▶│ cno_ocupacion│
└─────────────┘     └──────────────────┘     └──────┬───────┘
                                                     │
                    ┌──────────────────┐              ├──▶ cno_denominacion
                    │ cno_conocimiento │──────────────┤
                    └──────────────────┘              ├──▶ cno_funciones
                    ┌──────────────────┐              ├──▶ cno_habilidad ◀── habilidad_destreza
                    │ cno_nivel_cualif │──────────────┤
                    └──────────────────┘              └──▶ cno_relacionadas

┌───────────────┐   ┌───────────────────┐   ┌───────────────┐   ┌──────────────────┐
│cuoc_gran_grupo│──▶│cuoc_subgrupo_princ│──▶│ cuoc_subgrupo │──▶│cuoc_grupo_primario│
└───────────────┘   └───────────────────┘   └───────────────┘   └────────┬─────────┘
                                                                         │
                    ┌───────────────────┐                     ┌──────────▼──────────┐
                    │cuoc_nivel_competen│────────────────────▶│   cuoc_ocupacion     │
                    └───────────────────┘                     └──────────┬───────────┘
                                                                         │
                                              ├──▶ cuoc_denominacion     │
                                              ├──▶ cuoc_funciones        │
                                              ├──▶ cuoc_area_cualific    │
                                              ├──▶ cuoc_reg_conocimiento ◀── cuoc_conocimiento
                                              └──▶ cuoc_destreza ◀── habilidad_destreza

           ┌────────────────────┐           ┌──────────────────────────┐
           │ cno_denominacion   │──────────▶│      correlativa         │◀── cuoc_denominacion
           └────────────────────┘           └──────────────────────────┘
           ┌────────────────────┐           ┌──────────────────────────┐
           │ cno_conocimiento   │──────────▶│ correlativa_conocimientos│◀── cuoc_conocimiento
           └────────────────────┘           └──────────────────────────┘
```

---

## Scripts Disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | **Inicio automatizado** — Docker + PostgreSQL + NestJS (Windows/PowerShell) |
| `npm run start:dev` | Iniciar NestJS en modo watch (requiere BD activa) |
| `npm run start` | Iniciar NestJS en modo normal |
| `npm run build` | Compilar el proyecto TypeScript |
| `npm run docker:up` | Levantar el contenedor de PostgreSQL |
| `npm run docker:down` | Detener el contenedor de PostgreSQL |

---

## Comandos Útiles de Docker

| Acción | Comando |
|---|---|
| **Levantar** la BD | `docker-compose up -d` |
| **Parar** la BD | `docker-compose down` |
| **Parar y BORRAR datos** | `docker-compose down -v` |
| **Reiniciar BD desde cero** | `docker-compose down -v && docker-compose up -d` |
| **Ver logs** de PostgreSQL | `docker logs clasificacion_postgres` |
| **Entrar a psql** | `docker exec -it clasificacion_postgres psql -U postgres -d clasificacion` |
| **Ver tablas** | `docker exec clasificacion_postgres psql -U postgres -d clasificacion -c "\dt"` |
| **Ver FKs de una tabla** | `docker exec clasificacion_postgres psql -U postgres -d clasificacion -c "\d nombre_tabla"` |
| **Ver estructura de tabla** | `docker exec clasificacion_postgres psql -U postgres -d clasificacion -c "\d cno_ocupacion"` |

---

## Orden de Trabajo Diario

```
1. Abrir Docker Desktop         → Esperar ícono verde
2. cp .env.example .env         → Solo la primera vez (configurar variables)
3. npm run dev                  → Todo automatizado (Docker + BD + API)
4. Trabajar en http://localhost:3000
5. Ctrl+C                      → Parar la API
6. docker-compose down          → (Opcional) Parar la BD
```

> **Tip:** Si usas `npm run dev` no necesitas ejecutar `docker-compose up -d` manualmente, el script lo hace por ti.

---

## Solución de Problemas

| Problema | Causa probable | Solución |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5433` | PostgreSQL no está corriendo | `docker-compose up -d` y esperar ~10s |
| `password authentication failed` | `.env` no coincide con `docker-compose.yml` | Verificar que `DB_PASSWORD` y `POSTGRES_PASSWORD` sean iguales |
| `database "clasificacion" does not exist` | Contenedor recién creado sin init | `docker-compose down -v && docker-compose up -d` |
| Puerto 5433 ocupado | Otro proceso usa el puerto | Cambiar `DB_PORT` en `.env` y `ports` en `docker-compose.yml` |
| `npm run dev` falla en Mac/Linux | Script `.ps1` es solo PowerShell | Usar `docker-compose up -d && npm run start:dev` |

---

## Licencia

Proyecto interno SENA — Clasificación de Ocupaciones.
