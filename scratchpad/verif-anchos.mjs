// VERIFICADOR INDEPENDIENTE (no commitear). Busca contenido que mida MÁS que
// la pantalla del teléfono y que NO tenga deslizador propio: con
// `#contenido { overflow-x: hidden }` eso ya no arrastra la página, pero queda
// INALCANZABLE, que es peor.
//
// Anchos útiles dentro de #contenido (p-4 = 16px por lado):
//   390 -> 358    360 -> 328    320 -> 288
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const raiz = resolve(process.argv[2] ?? '.')
const UTIL = { 390: 358, 360: 328, 320: 288 }

const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

function archivos(dir, ext = /\.tsx$/) {
  const out = []
  const rec = (d) => {
    for (const n of readdirSync(d)) {
      const abs = resolve(d, n)
      if (n === 'node_modules' || n === '.next') continue
      if (statSync(abs).isDirectory()) rec(abs)
      else if (ext.test(n) && !/\.test\.tsx?$/.test(n)) out.push(abs)
    }
  }
  rec(resolve(raiz, dir))
  return out
}

// Escala Tailwind -> px (w-64 = 16rem = 256px)
const escala = (n) => (Number(n) / 4) * 16
const SCROLLER = /scroll-x-fade|overflow-x-auto|overflow-x-scroll|tabla-desliza|overflow-auto|overflow-x-hidden|overflow-hidden/

const hallazgos = []
const push = (tipo, abs, idx, src, detalle, px) => {
  const linea = src.slice(0, idx).split('\n').length
  const ventana = src.slice(Math.max(0, idx - 700), idx)
  const cubierto = SCROLLER.test(ventana)
  hallazgos.push({ tipo, archivo: relative(raiz, abs), linea, detalle, px, cubierto })
}

for (const abs of [...archivos('app/(dashboard)'), ...archivos('components')]) {
  if (abs.includes('/components/landing/')) continue // landings: sistema propio, fuera de #contenido
  const src = sinComentarios(readFileSync(abs, 'utf8'))

  // 1. anchos fijos en px arbitrarios: w-[400px], min-w-[600px]
  for (const m of src.matchAll(/\b(min-w|w)-\[(\d+)px\]/g)) {
    const px = Number(m[2])
    if (px > UTIL[320]) push('ancho fijo px', abs, m.index, src, m[0], px)
  }
  // 2. anchos de escala Tailwind grandes: w-96 (384), min-w-80 (320)...
  for (const m of src.matchAll(/(?<![-\w:])(min-w|w)-(\d{2,3})(?![\w[])/g)) {
    const px = escala(m[2])
    if (px > UTIL[320]) push('ancho escala', abs, m.index, src, `${m[0]} (~${px}px)`, px)
  }
  // 3. grillas con columna mínima fija
  for (const m of src.matchAll(/minmax\((\d+)px/g)) {
    const px = Number(m[1])
    if (px * 2 > UTIL[320]) push('minmax grid', abs, m.index, src, m[0], px)
  }
  // 4. grid-cols-N base (sin prefijo responsive) con N>=3
  for (const m of src.matchAll(/(?<![-\w:])grid-cols-(\d+)/g)) {
    const n = Number(m[1])
    if (n >= 3) push('grid-cols base', abs, m.index, src, m[0], n)
  }
}

const porTipo = {}
for (const h of hallazgos) (porTipo[h.tipo] ??= []).push(h)

for (const [tipo, lista] of Object.entries(porTipo)) {
  const sinCubrir = lista.filter((h) => !h.cubierto)
  console.log(`\n=== ${tipo}: ${lista.length} total, ${sinCubrir.length} SIN deslizador cerca ===`)
  for (const h of sinCubrir) console.log(`  ${h.archivo}:${h.linea}  ${h.detalle}`)
}
