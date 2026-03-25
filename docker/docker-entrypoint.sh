#!/bin/sh
set -e

echo "======================================================"
echo "  coding-agent-ui  |  Starting up…"
echo "  Node:   $(node --version)"
echo "  npm:    $(npm --version)"
echo "  Python: $(python3 --version)"
echo "======================================================"

# If a .env file was mounted at /app/.env, it is already in place.
# If not, fall back to .env.example defaults.
if [ ! -f /app/.env ] && [ -f /app/.env.example ]; then
  echo "[entrypoint] No .env found – copying .env.example as .env"
  cp /app/.env.example /app/.env
fi

# Honour PORT / HOST env-vars passed in at runtime
export PORT="${PORT:-3001}"
export HOST="${HOST:-0.0.0.0}"

echo "[entrypoint] Starting server on ${HOST}:${PORT} …"

# npm run start  =  npm run build && npm run server
# The build was already done at image-build time, so we start the server directly.
exec node server/index.js
