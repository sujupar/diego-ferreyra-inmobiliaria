#!/bin/bash
# Navegador exclusivo de Claude para el QA de la plataforma en la UI.
#
#   scripts/navegador-claude.sh abrir [url]   → lo abre (no hace nada si ya está)
#   scripts/navegador-claude.sh cerrar        → lo cierra
#   scripts/navegador-claude.sh estado        → dice si está abierto y qué pestañas tiene
#
# Es UN Chrome aparte, con su propio perfil (~/.cache/claude-browser) donde queda
# guardado el login del usuario "Claude · pruebas", y con el puerto de depuración
# 9222 abierto para que la herramienta chrome-devtools de Claude se conecte a ese
# MISMO navegador (--browserUrl http://127.0.0.1:9222), desde cualquier sesión.
#
# Ciclo de vida (decisión del dueño, 2026-09-10): se abre al empezar el QA de un
# desarrollo y se cierra cuando ese desarrollo ya está desplegado en producción y
# verificado. No queda abierto de forma permanente.
#
# Por qué no el perfil default del MCP: ese perfil lo toma la primera sesión y las
# demás fallan con "The browser is already running" (pasó el 2026-09-10 con dos
# sesiones en paralelo). Con este esquema el navegador vive por fuera de las
# sesiones y todas lo comparten.
set -euo pipefail
PERFIL="$HOME/.cache/claude-browser"
PUERTO=9222
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ACCION="${1:-abrir}"
URL="${2:-https://inmodf.com.ar/}"

abierto() { curl -s -m 2 "http://127.0.0.1:$PUERTO/json/version" >/dev/null 2>&1; }

case "$ACCION" in
  abrir)
    if abierto; then echo "El navegador de Claude ya está abierto (puerto $PUERTO)."; exit 0; fi
    mkdir -p "$PERFIL"
    nohup "$CHROME" \
      --user-data-dir="$PERFIL" \
      --remote-debugging-port=$PUERTO \
      --no-first-run --no-default-browser-check \
      --window-size=1440,900 \
      "$URL" >"$PERFIL/chrome.log" 2>&1 &
    for _ in 1 2 3 4 5 6 7 8 9 10; do abierto && break; sleep 1; done
    abierto && echo "Navegador de Claude abierto (perfil $PERFIL, puerto $PUERTO)." || { echo "No levantó; ver $PERFIL/chrome.log"; exit 1; }
    ;;
  cerrar)
    if ! abierto; then echo "El navegador de Claude no estaba abierto."; exit 0; fi
    pkill -f -- "--user-data-dir=$PERFIL" || true
    for _ in 1 2 3 4 5; do abierto || break; sleep 1; done
    abierto && { echo "No se pudo cerrar."; exit 1; } || echo "Navegador de Claude cerrado."
    ;;
  estado)
    if abierto; then
      echo "Abierto (puerto $PUERTO). Pestañas:"
      curl -s "http://127.0.0.1:$PUERTO/json" | grep -o '"url": *"[^"]*"' | grep -v "chrome://" | sed 's/"url": *//'
    else
      echo "Cerrado."
    fi
    ;;
  *)
    echo "Uso: $0 abrir [url] | cerrar | estado"; exit 2 ;;
esac
