#!/bin/sh
set -e
if [ -n "$LITESTREAM_BUCKET" ]; then
  mkdir -p "$(dirname "$DATABASE_PATH")"
  litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists "$DATABASE_PATH"
  exec litestream replicate -config /etc/litestream.yml -exec "node server/src/http/server.ts"
fi
exec node server/src/http/server.ts
