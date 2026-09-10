#!/bin/bash
# Navegador exclusivo de Claude para probar la plataforma en la UI.
#
# Abre UN Chrome aparte, con su propio perfil (~/.cache/claude-browser) donde
# queda guardado el login de la plataforma, y con el puerto de depuración
# 9222 abierto para que cualquier sesión de Claude se conecte a ese MISMO
# navegador (chrome-devtools-mcp --browserUrl http://127.0.0.1:9222).
#
# Por qué no el perfil default del MCP: ese perfil lo abre la primera sesión y
# las demás fallan con "The browser is already running" (pasó el 2026-09-10).
# Con este esquema, el navegador vive por fuera de las sesiones y todas lo
# comparten. Si ya está abierto, este script no hace nada.
set -euo pipefail
PERFIL="$HOME/.cache/claude-browser"
PUERTO=9222
URL="${1:-https://inmodf.com.ar/}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if curl -s -m 2 "http://127.0.0.1:$PUERTO/json/version" >/dev/null 2>&1; then
  echo "El navegador de Claude ya está abierto en el puerto $PUERTO."
  exit 0
fi
mkdir -p "$PERFIL"
nohup "$CHROME" \
  --user-data-dir="$PERFIL" \
  --remote-debugging-port=$PUERTO \
  --no-first-run --no-default-browser-check \
  --window-size=1440,900 \
  "$URL" >"$PERFIL/chrome.log" 2>&1 &
echo "Navegador de Claude abierto (perfil $PERFIL, puerto $PUERTO)."
