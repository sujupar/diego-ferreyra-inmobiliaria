// Compila app/globals.css con el mismo postcss que usa Next, sin arrancar
// Turbopack (que revienta por el acento de "Gestión" en el path del proyecto
// original). Sirve para verificar que el CSS es válido y que las utilidades y
// clases nuevas EXISTEN de verdad en la hoja emitida.
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '..')
const entrada = path.join(raiz, 'app/globals.css')
const css = readFileSync(entrada, 'utf8')

const res = await postcss([tailwind({ optimize: false })]).process(css, { from: entrada })
const salida = res.css

const esperadas = process.argv.slice(2)
let fallo = false
for (const sel of esperadas) {
  const ok = salida.includes(sel)
  console.log(`${ok ? 'OK  ' : 'FALTA'} ${sel}`)
  if (!ok) fallo = true
}
console.log(`\nCSS compilado: ${salida.length} bytes, ${res.warnings().length} avisos`)
for (const w of res.warnings()) console.log('AVISO:', w.toString())
process.exit(fallo ? 1 : 0)
