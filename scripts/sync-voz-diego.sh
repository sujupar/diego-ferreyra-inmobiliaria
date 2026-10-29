#!/usr/bin/env bash
# Re-correr si cambian las reglas de voz de Diego.
# Copia el "cerebro" del guion (voz, método, playbook) desde el workspace de OpenClaw
# a lib/guion/voz/ para que el guionizado de noticias suene a Diego.
set -euo pipefail
SRC="${HOME}/.openclaw/workspace/diego-data"
DEST="$(cd "$(dirname "$0")/.." && pwd)/lib/guion/voz"
mkdir -p "$DEST"
cp "$SRC/diego-voz/REGLAS-VOZ-DIEGO.md" "$DEST/"
cp "$SRC/diego-voz/diego-voz-corpus.txt" "$DEST/"
cp "$SRC/guiones/METODO-GUIONISTA.md" "$DEST/"
cp "$SRC/guiones/PLAYBOOK-FORMATOS.md" "$DEST/"
echo "Voz de Diego sincronizada en $DEST"
