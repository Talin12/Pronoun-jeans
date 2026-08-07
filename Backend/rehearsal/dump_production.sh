#!/usr/bin/env bash
#
# READ-ONLY dump of the production `public` schema (schema + data) to a local file.
# This is the ONLY production access in the rehearsal workflow. pg_dump never
# writes to the source. Cloudinary is never touched.
#
# Uses the SESSION pooler (port 5432) — the transaction pooler (6543) cannot
# pg_dump. Runs pg_dump 17 inside a throwaway postgres:17 container so the client
# major version matches the production server.
#
# Usage:  rehearsal/dump_production.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$(cd "$DIR/.." && pwd)"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$DIR/prod_dump_${TS}.sql"          # timestamped, immutable
LATEST="$DIR/prod_dump.sql"             # canonical pointer used by reset_rehearsal.sh

# Build the session-pooler URL from Backend/.env (password stays in a var, never argv).
URL="$(python3 - "$BACKEND/.env" <<'PY'
import re, sys, urllib.parse as up
env = open(sys.argv[1]).read()
u = re.search(r'DATABASE_URL=(\S+)', env).group(1)
p = up.urlparse(u)
print(f'postgresql://{p.username}:{up.quote(p.password)}@{p.hostname}:5432/{p.path.lstrip("/")}')
PY
)"
HOST="$(printf '%s' "$URL" | sed -E 's#.*@([^:/]+).*#\1#')"

echo "=================================================="
echo " DUMP target DB host : $HOST"
echo " Access              : READ-ONLY pg_dump (public schema)"
echo " Cloudinary          : NOT TOUCHED"
echo "=================================================="

attempt=0
until [[ $attempt -ge 3 ]]; do
  attempt=$((attempt+1))
  echo "pg_dump attempt $attempt ..."
  if docker run --rm -e DBURL="$URL" -e PGCONNECT_TIMEOUT=30 postgres:17 \
       sh -c 'pg_dump "$DBURL" --schema=public --no-owner --no-privileges --no-acl' \
       > "$OUT" 2>/tmp/pgdump.err; then
    cp "$OUT" "$LATEST"
    echo "Wrote $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
    echo "Updated pointer $LATEST"
    exit 0
  fi
  echo "  attempt $attempt failed:"; tail -3 /tmp/pgdump.err | sed 's/^/    /'
  sleep 3
done
echo "ERROR: pg_dump failed after $attempt attempts." >&2
exit 1
