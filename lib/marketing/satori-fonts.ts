/**
 * Carga las fuentes que usa el engine de typography overlay (satori).
 *
 * Las fuentes viven en public/fonts/ (no en node_modules) porque Next.js
 * standalone + @netlify/plugin-nextjs hace tracing estático de imports —
 * los .woff dentro de node_modules NO se incluyen en el lambda deployado.
 * public/ sí se incluye siempre. Verificado por QA workflow.
 *
 * Las cargamos UNA VEZ al importar el módulo y las dejamos en memoria —
 * satori las necesita sincrónicamente.
 *
 * Stack tipográfico elegido:
 *  - Inter (sans-serif geométrica neutra) → headlines, precio, specs
 *    Pesos: 400 (regular), 600 (semibold), 700 (bold)
 *  - Cormorant Garamond (serif editorial elegante) → títulos editoriales
 *    en estilos magazine/typography_dominant. Pesos: 400, 700.
 *
 * Equivalente visual a Söhne + Tiempos sin licencia paga.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function load(filename: string): Buffer {
  // Las fuentes viven en public/fonts/ del bundle. Next.js incluye public/
  // siempre, sea standalone build o runtime tradicional.
  return readFileSync(join(process.cwd(), 'public', 'fonts', filename))
}

export interface FontEntry {
  name: string
  data: Buffer
  weight: number
  style: 'normal' | 'italic'
}

let cached: FontEntry[] | null = null

export function getSatoriFonts(): FontEntry[] {
  if (cached) return cached
  cached = [
    { name: 'Inter', data: load('inter-400.woff'), weight: 400, style: 'normal' },
    { name: 'Inter', data: load('inter-600.woff'), weight: 600, style: 'normal' },
    { name: 'Inter', data: load('inter-700.woff'), weight: 700, style: 'normal' },
    { name: 'Cormorant Garamond', data: load('cormorant-400.woff'), weight: 400, style: 'normal' },
    { name: 'Cormorant Garamond', data: load('cormorant-700.woff'), weight: 700, style: 'normal' },
  ]
  return cached
}
