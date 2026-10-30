#!/bin/sh
# Sincroniza POSTGRES_PASSWORD / POSTGRES_DB del entorno en cada arranque.
# La imagen oficial solo aplica esas vars si el volumen está vacío.
set -eu

USER_NAME="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-$USER_NAME}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD vacío}"

PG_PID=""
term() {
  if [ -n "$PG_PID" ]; then
    kill -TERM "$PG_PID" 2>/dev/null || true
    wait "$PG_PID" || true
  fi
  exit 0
}
trap term TERM INT

docker-entrypoint.sh "$@" &
PG_PID=$!

i=0
while [ "$i" -lt 90 ]; do
  if pg_isready -U "$USER_NAME" -d postgres >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

if ! pg_isready -U "$USER_NAME" -d postgres >/dev/null 2>&1; then
  echo "sync-env: Postgres no listo" >&2
  wait "$PG_PID"
  exit 1
fi

psql -v ON_ERROR_STOP=1 -U "$USER_NAME" -d postgres \
  --set=pwd="$POSTGRES_PASSWORD" \
  --set=dbuser="$USER_NAME" <<'SQL'
ALTER USER :"dbuser" WITH PASSWORD :'pwd';
SQL

exists="$(psql -U "$USER_NAME" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | tr -d '[:space:]')"
if [ "$exists" != "1" ]; then
  psql -v ON_ERROR_STOP=1 -U "$USER_NAME" -d postgres \
    --set=dbname="$DB_NAME" <<'SQL'
CREATE DATABASE :"dbname";
SQL
fi

echo "sync-env: password y database alineados con .env"

# Seed en cada arranque: initdb.d solo corre si el volumen está vacío.
has_schema="$(psql -U "$USER_NAME" -d "$DB_NAME" -tAc "SELECT 1 FROM pg_namespace WHERE nspname='clasificacion'" | tr -d '[:space:]')"
if [ "$has_schema" != "1" ]; then
  echo "sync-env: schema ausente, ejecutando 01-schema.sql"
  psql -v ON_ERROR_STOP=1 -U "$USER_NAME" -d "$DB_NAME" -f /docker-entrypoint-initdb.d/01-schema.sql
fi
echo "sync-env: aplicando 02-seed.sql"
psql -v ON_ERROR_STOP=1 -U "$USER_NAME" -d "$DB_NAME" -f /docker-entrypoint-initdb.d/02-seed.sql

wait "$PG_PID"
