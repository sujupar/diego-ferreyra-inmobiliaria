#!/bin/bash
# Corrida diaria del radar (la dispara launchd a las 8:00; también se puede correr a mano).
# Primero actualiza el clon propio (~/.radar-referencias/app) y después corre el radar.
# Los argumentos extra (--seco, --forzar) pasan tal cual a `radar/cli.ts correr`.
#
# TODO el cuerpo vive dentro de main(): bash lee los scripts de a poco, por posición de
# byte. Si `git merge` reemplaza ESTE archivo mientras corre (el día que sale una versión
# nueva), un script suelto seguiría leyendo bytes de otra versión. Con main() bash ya
# parseó la función entera antes de ejecutar el merge.
set -u

main() {
  local BASE="$HOME/.radar-referencias"
  cd "$BASE/app" || { echo "[radar] no existe $BASE/app: corré 'radar instalar'"; return 1; }

  local RAMA
  RAMA="$(cat "$BASE/rama" 2>/dev/null || echo main)"
  # Sin pregunta de credenciales y con corte si la red se cuelga (<1 KB/s durante 30 s).
  export GIT_TERMINAL_PROMPT=0 GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=30
  if ! { git fetch origin "$RAMA" && git merge --ff-only "origin/$RAMA"; }; then
    echo "[radar] no pude actualizar, sigo con $(git rev-parse --short HEAD)"
  fi

  # npm ci solo si cambió package-lock.json desde la última vez.
  local HASH
  HASH="$(shasum -a 256 package-lock.json | cut -d' ' -f1)"
  if [ "$HASH" != "$(cat "$BASE/lock-hash" 2>/dev/null || true)" ] || [ ! -d node_modules ]; then
    echo "[radar] package-lock.json cambió: npm ci"
    if npm ci; then echo "$HASH" > "$BASE/lock-hash"; else echo "[radar] npm ci falló, sigo igual"; fi
  fi

  node --env-file="$BASE/.env" --import tsx radar/cli.ts correr "$@"
  return $?
}

# Una sola línea: bash no debe leer nada más del archivo cuando main termina.
main "$@"; exit $?
