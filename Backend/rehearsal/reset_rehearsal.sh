#!/usr/bin/env bash
#
# Reset the LOCAL rehearsal database to a clean copy of the production dump,
# so migrate_media can be rehearsed repeatedly from an identical starting state.
#
# It NEVER touches production: it only drops + reloads the local Docker Postgres.
# Requires: Docker running, prod_dump.sql present (created by dump_production.sh).
#
# Usage:  rehearsal/reset_rehearsal.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
set -a; . "$DIR/.env.rehearsal"; set +a

CONTAINER="${REHEARSAL_PG_CONTAINER:-pj-rehearsal-pg}"
PORT="${REHEARSAL_PG_PORT:-55433}"
IMAGE="${REHEARSAL_PG_IMAGE:-postgres:17}"
DUMP="$DIR/prod_dump.sql"

if [[ ! -f "$DUMP" ]]; then
  echo "ERROR: $DUMP not found. Run rehearsal/dump_production.sh first." >&2
  exit 1
fi

# Start the container if it isn't already running.
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    docker start "$CONTAINER" >/dev/null
  else
    echo "Starting $IMAGE as $CONTAINER on port $PORT ..."
    docker run -d --name "$CONTAINER" \
      -e POSTGRES_PASSWORD=rehearsal -e POSTGRES_DB=postgres \
      -p "${PORT}:5432" "$IMAGE" >/dev/null
  fi
fi

# Wait for readiness.
until docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

echo "Resetting rehearsal DB (dropping + reloading public schema) ..."
docker exec -i "$CONTAINER" psql -q -U postgres -d postgres \
  -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null
docker exec -i "$CONTAINER" psql -q -v ON_ERROR_STOP=0 -U postgres -d postgres < "$DUMP" >/dev/null

echo "Done. Local rehearsal DB restored from prod_dump.sql on port ${PORT}."
echo "Target: 127.0.0.1:${PORT}  (NOT production)"
