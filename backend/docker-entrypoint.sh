#!/bin/sh
set -e

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"

echo "[entrypoint] Esperando MySQL en ${DB_HOST}:${DB_PORT}..."
node -e "
const net = require('net');
const host = process.env.DB_HOST || 'mysql';
const port = Number(process.env.DB_PORT || 3306);
function wait() {
  const socket = net.createConnection({ host, port }, () => {
    socket.end();
    process.exit(0);
  });
  socket.on('error', () => setTimeout(wait, 2000));
}
wait();
"
echo "[entrypoint] MySQL alcanzable"

BUNDLED="/app/bundled-opening-docs"
DEST="${UPLOADS_DIR:-/app/uploads}/opening-docs"
if [ -d "$BUNDLED" ]; then
  mkdir -p "$DEST"
  for event_dir in "$BUNDLED"/*; do
    [ -d "$event_dir" ] || continue
    event_id=$(basename "$event_dir")
    mkdir -p "$DEST/$event_id"
    for f in "$event_dir"/*; do
      [ -f "$f" ] || continue
      name=$(basename "$f")
      if [ ! -f "$DEST/$event_id/$name" ]; then
        cp "$f" "$DEST/$event_id/$name"
        echo "[entrypoint] Sembrado opening-docs/$event_id/$name"
      fi
    done
  done
fi

echo "[entrypoint] Ejecutando migraciones..."
node src/migrations/migrate.js

echo "[entrypoint] Arrancando API..."
exec "$@"
