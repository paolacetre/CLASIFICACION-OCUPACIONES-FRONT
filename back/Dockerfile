# syntax=docker/dockerfile:1
# ============================================================
#  Dockerfile — Backend NestJS (multi-stage)
#  development → hot-reload (nest start --watch)
#  builder     → Node.js 22 + tsc
#  production  → imagen mínima sin devDependencies
# ============================================================

# ── Stage 0: Desarrollo (hot-reload) ─────────────────────────
FROM node:22-alpine AS development

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src

# `prestart:dev` ejecuta db-migrate.js --check antes de arrancar, así que el
# runner y los .sql tienen que estar en la imagen: sin ellos npm abortaba con un
# "Cannot find module" en vez del aviso de migraciones pendientes.
COPY scripts/db-migrate.js ./scripts/db-migrate.js
COPY database/migrations ./database/migrations
# Libro oficial que aplica SiembraCnoService al arrancar.
COPY database/siembra ./database/siembra

EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ── Stage 1: Compilación NestJS ──────────────────────────────
FROM node:22-alpine AS builder

LABEL stage="builder"

WORKDIR /app

# Copiar manifiestos primero (cache de capas)
COPY package.json package-lock.json ./

# Instalar TODAS las dependencias (devDeps incluidas para el compilador TS)
RUN npm ci

# Copiar archivos de configuración TypeScript y código fuente
COPY tsconfig*.json ./
COPY src ./src

# Compilar TypeScript → dist/ usando tsc directamente
# (nest build requiere nest-cli.json; tsc es más portable en Docker)
RUN npx tsc -p tsconfig.json

# ── Stage 2: Imagen de producción ───────────────────────────
FROM node:22-alpine AS production

LABEL maintainer="SENA CUOC <cuoc@sena.edu.co>"

# Crear usuario no-root para mayor seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copiar solo los manifiestos e instalar SOLO dependencias de producción
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar el código compilado desde el stage anterior
COPY --from=builder /app/dist ./dist

# Runner de migraciones + los .sql que aplica.
# Van en la imagen a propósito: el contenedor aplica lo que falte al arrancar,
# así que desplegar no depende de que alguien recuerde lanzar un comando a mano
# ni de que el servidor tenga Node instalado.
COPY scripts/db-migrate.js ./scripts/db-migrate.js
COPY database/migrations ./database/migrations
# Libro oficial del catálogo CNO: SiembraCnoService lo aplica al arrancar, una
# vez por versión del archivo (ver src/modules/seed/siembra-cno.service.ts).
COPY database/siembra ./database/siembra

# Cambiar al usuario no-root
USER appuser

# Puerto del servidor NestJS
EXPOSE 3000

# Migrar y luego servir. Si una migración falla, el proceso termina y el
# contenedor NO llega a servir: es preferible un arranque que falla ruidosamente
# a una API sirviendo contra un esquema desactualizado (ver db-migrate.js).
CMD ["sh", "-c", "node scripts/db-migrate.js && node dist/main.js"]
