/**
 * Motor de render de la capa de texto de los carruseles (satori → resvg → PNG).
 * satori vectoriza el layout (construido con h()) a SVG con Montserrat/Lato
 * embebidas, y resvg lo rasteriza a PNG exacto de 1080×1350.
 *
 * Fuentes en public/fonts/ (Next incluye public/ en el bundle de Netlify — mismo
 * patrón que lib/marketing/satori-fonts.ts). No usa JSX: h() arma los elementos
 * que satori entiende ({ type, props }).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

export const W = 1080
export const H = 1350

const loadFont = (file: string): Buffer =>
  readFileSync(join(process.cwd(), 'public', 'fonts', file))

let cachedFonts: Array<{ name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: 'normal' }> | null = null
function fonts() {
  if (cachedFonts) return cachedFonts
  cachedFonts = [
    { name: 'Montserrat', data: loadFont('montserrat-600.woff'), weight: 600, style: 'normal' },
    { name: 'Montserrat', data: loadFont('montserrat-700.woff'), weight: 700, style: 'normal' },
    { name: 'Montserrat', data: loadFont('montserrat-800.woff'), weight: 800, style: 'normal' },
    { name: 'Lato', data: loadFont('lato-400.woff'), weight: 400, style: 'normal' },
    { name: 'Lato', data: loadFont('lato-700.woff'), weight: 700, style: 'normal' },
  ]
  return cachedFonts
}

export type El = { type: string; props: Record<string, any> }

/** Hyperscript mínimo compatible con satori. */
export function h(type: string, props?: Record<string, any> | null, ...children: any[]): El {
  const kids = children
    .flat(Infinity)
    .filter((c) => c !== null && c !== undefined && c !== false && c !== '')
  return {
    type,
    props: {
      ...(props || {}),
      children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids,
    },
  }
}

export async function renderSlide(element: El): Promise<Buffer> {
  const svg = await satori(element as any, { width: W, height: H, fonts: fonts() as any })
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { loadSystemFonts: false },
  })
  return Buffer.from(resvg.render().asPng())
}
