#!/usr/bin/env bash
# Re-correr si cambian las reglas de voz de Diego.
# Copia el "cerebro" del guion (voz, método, playbook) desde el workspace de OpenClaw
# a lib/guion/voz/ (fuentes .md/.txt) y GENERA los módulos .ts que importa guionizar.ts
# (import estático => entran al bundle, sin depender de fs/cwd en runtime).
set -euo pipefail
SRC="${HOME}/.openclaw/workspace/diego-data"
DEST="$(cd "$(dirname "$0")/.." && pwd)/lib/guion/voz"
mkdir -p "$DEST"
cp "$SRC/diego-voz/REGLAS-VOZ-DIEGO.md" "$DEST/"
cp "$SRC/diego-voz/diego-voz-corpus.txt" "$DEST/"
cp "$SRC/guiones/METODO-GUIONISTA.md" "$DEST/"
cp "$SRC/guiones/PLAYBOOK-FORMATOS.md" "$DEST/"

gen() { # <fuente> <salida.ts>
  node -e '
    const fs = require("fs");
    const txt = fs.readFileSync(process.argv[1], "utf8")
      .replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    fs.writeFileSync(process.argv[2],
      "// GENERADO por scripts/sync-voz-diego.sh — no editar a mano.\nconst texto = `" + txt + "`\nexport default texto\n");
  ' "$DEST/$1" "$DEST/$2"
}
gen REGLAS-VOZ-DIEGO.md reglas.ts
gen diego-voz-corpus.txt corpus.ts
gen METODO-GUIONISTA.md metodo.ts
gen PLAYBOOK-FORMATOS.md playbook.ts
echo "Voz de Diego sincronizada en $DEST"
