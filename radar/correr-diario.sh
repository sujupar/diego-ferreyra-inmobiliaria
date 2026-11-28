#!/bin/bash
# Corrida diaria del radar (la dispara launchd a las 8:00; también se puede correr a mano).
# Primero actualiza el clon propio (~/.radar-referencias/app) y después corre el radar.
# Los argumentos extra (--seco, --forzar) pasan tal cual a `radar/cli.ts correr`.
set -u
BASE="$HOME/.radar-referencias"
cd "$BASE/app" || { echo "[radar] no existe $BASE/app: corré 'radar instalar'"; exit 1; }

RAMA="$(cat "$BASE/rama" 2>/dev/null || echo main)"
if git fetch origin "$RAMA" && git merge --ff-only "origin/$RAMA"; then
  :
else
  echo "[radar] no pude actualizar, sigo con $(git rev-parse --short HEAD)"
fi

# npm ci solo si cambió package-lock.json desde la última vez.
HASH="$(shasum -a 256 package-lock.json | cut -d' ' -f1)"
if [ "$HASH" != "$(cat "$BASE/lock-hash" 2>/dev/null || true)" ] || [ ! -d node_modules ]; then
  echo "[radar] package-lock.json cambió: npm ci"
  if npm ci; then echo "$HASH" > "$BASE/lock-hash"; else echo "[radar] npm ci falló, sigo igual"; fi
fi

exec node --env-file="$BASE/.env" --import tsx radar/cli.ts correr "$@"
