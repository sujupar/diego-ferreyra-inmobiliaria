#!/usr/bin/env bash
# Prueba de mutación de la Fase 2: rompe UNA línea a la vez y confirma que los
# tests se ponen rojos. Restaura siempre, incluso si algo falla.
#
# ⚠️  NO CORRERLO CON OTRA SESIÓN TRABAJANDO EN LA MISMA CARPETA. Copia los
#     archivos de ARCHIVOS a /tmp al empezar y los vuelve a copiar al terminar:
#     si en el medio otra sesión escribe uno de esos archivos, este script le
#     revierte el trabajo en silencio. Antes de correrlo, `git status`; después,
#     `git diff` de los cuatro archivos.
set -uo pipefail
cd "$(dirname "$0")/.."

SUITE=(components/ui/DataTable.test.tsx components/ui/DataTable.ficha.test.tsx \
  "app/(dashboard)/columnas-de-ficha.test.ts" app/globals.ficha.test.ts \
  "app/(dashboard)/visits/_components/VisitsTable.test.tsx")

ARCHIVOS=(components/ui/DataTable.tsx app/globals.css \
  "app/(dashboard)/contacts/page.tsx" "app/(dashboard)/visits/_components/VisitsTable.tsx")

respaldar() { for f in "${ARCHIVOS[@]}"; do cp "$f" "/tmp/mutbak-$(echo "$f" | tr '/ ' '__')"; done; }
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "/tmp/mutbak-$(echo "$f" | tr '/ ' '__')" "$f"; done; }
trap restaurar EXIT

respaldar

fallidas=0
mutar() { # $1 = nombre  $2 = archivo  $3 = python de reemplazo
  local nombre="$1" archivo="$2" py="$3"
  python3 - "$archivo" <<PY
import sys
ruta = sys.argv[1]
s = open(ruta, encoding='utf-8').read()
antes = s
$py
assert s != antes, "LA MUTACIÓN NO CAMBIÓ NADA — el texto buscado no existe"
open(ruta, 'w', encoding='utf-8').write(s)
PY
  if [ $? -ne 0 ]; then echo "‼️  $nombre — no se pudo aplicar la mutación"; fallidas=$((fallidas+1)); restaurar; return; fi
  if npx vitest run "${SUITE[@]}" --silent=true >/tmp/mut-out.txt 2>&1; then
    echo "❌ VERDE CON EL BUG PUESTO — $nombre"
    fallidas=$((fallidas+1))
  else
    echo "✅ rojo — $nombre ($(grep -oE '[0-9]+ failed' /tmp/mut-out.txt | head -1))"
  fi
  restaurar
}

mutar "DataTable: el contenedor pierde la clase .tabla-ficha" components/ui/DataTable.tsx \
  "s = s.replace(\"cardMode ? 'tabla-ficha ' : ''\", \"false ? 'tabla-ficha ' : ''\")"

mutar "DataTable: la primera columna deja de ser el título por default" components/ui/DataTable.tsx \
  "s = s.replace(\"!hayTituloDeclarado && i === 0 ? 'title' : 'meta'\", \"'meta'\")"

mutar "DataTable: el primer dato deja de marcarse (vuelve el punto de más)" components/ui/DataTable.tsx \
  "s = s.replace(\"data-primero={cardMode && i === indicePrimerDato ? '' : undefined}\", '')"

mutar "DataTable: el salto y la flecha vuelven a contar como celdas" components/ui/DataTable.tsx \
  "s = s.replace('aria-hidden=\"true\" data-celda', 'data-celda')"

mutar "DataTable: la ficha viene apagada por default" components/ui/DataTable.tsx \
  "s = s.replace('cardMode = true', 'cardMode = false')"

mutar "DataTable: desaparece la barra de ordenar/seleccionar de la ficha" components/ui/DataTable.tsx \
  "s = s.replace('{cardMode && (selectable || ordenables.length > 0) && (', '{false && (')"

mutar "DataTable: 'wrap' deja de tener efecto (todo vuelve a nowrap)" components/ui/DataTable.tsx \
  "s = s.replace(\"col.wrap ? '' : 'whitespace-nowrap'\", \"col.wrap ? 'whitespace-nowrap' : 'whitespace-nowrap'\")"

mutar "DataTable: se cae el rol explícito de la fila" components/ui/DataTable.tsx \
  "s = s.replace('''                role=\"row\"\n                key={key}''', '                key={key}')"

mutar "CSS: el contenedor cambia de nombre" app/globals.css \
  "s = s.replace('container-name: tabla;', 'container-name: grilla;')"

mutar "CSS: la fila deja de ser un flex" app/globals.css \
  "s = s.replace('''    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;''', '    align-items: flex-start;')"

mutar "CSS: la ficha se decide por ventana en vez de por contenedor" app/globals.css \
  "s = s.replace('@container tabla (max-width: 40rem)', '@media (max-width: 40rem)')"

mutar "CSS: el umbral vuelve a 48rem y el escritorio pasa a fichas" app/globals.css \
  "s = s.replace('@container tabla (max-width: 40rem)', '@container tabla (max-width: 48rem)')"

mutar "CSS: el aviso de deslizamiento usa el atajo que borra el fondo" app/globals.css \
  "s = s.replace('  background-image:\n', '  background:\n')"

mutar "CSS: el título deja de poder encogerse" app/globals.css \
  "s = s.replace('''    flex: 1 1 0;
    min-width: 0;
    font-weight: 500;''', '''    flex: 1 1 0;
    font-weight: 500;''')"

mutar "CSS: el salto deja de ocupar todo el ancho" app/globals.css \
  "s = s.replace('    flex: 0 0 100%;', '    flex: none;')"

mutar "Contactos: la columna Nombre deja de ser el título de la ficha" "app/(dashboard)/contacts/page.tsx" \
  "s = s.replace(\"label: 'Nombre', sortable: true, card: 'title'\", \"label: 'Nombre', sortable: true\")"

mutar "Contactos: el renglón de datos vuelve al flex que arrastraba la página" "app/(dashboard)/contacts/page.tsx" \
  "s = s.replace('className=\"row-meta text-sm text-muted-foreground\"', 'className=\"flex items-center gap-4 text-sm text-muted-foreground\"')"

mutar "Contactos: el conmutador de vista pierde su nombre" "app/(dashboard)/contacts/page.tsx" \
  "s = s.replace('aria-label=\"Ver como fichas\"', '')"

mutar "Visitas: la fecha vuelve a imprimir segundos y reloj de 12" "app/(dashboard)/visits/_components/VisitsTable.tsx" \
  "s = s.replace('''  const dia = cuando.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const hora = cuando.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return \`\${dia}, \${hora}\`''', \"  return cuando.toLocaleString('es-AR')\")"

mutar "Visitas: el asesor y el botón Ver vuelven a la ficha" "app/(dashboard)/visits/_components/VisitsTable.tsx" \
  "s = s.replace(\"card: 'none', render: v => <span>{v.advisor?.full_name ?? '-'}</span>\", \"card: 'meta', render: v => <span>{v.advisor?.full_name ?? '-'}</span>\")"

echo
if [ "$fallidas" -eq 0 ]; then echo "TODAS LAS MUTACIONES SE DETECTARON"; else echo "MUTACIONES NO DETECTADAS O NO APLICADAS: $fallidas"; fi
