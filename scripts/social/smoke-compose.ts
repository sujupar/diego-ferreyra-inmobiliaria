// Smoke test del compositor: un slide de cada layout (escenas en fallback).
// Correr: node --import tsx scripts/social/smoke-compose.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { composeSlide } from '../../lib/social/compose'
import type { ScriptSlide } from '../../lib/social/brand-bible'

const OUT = '/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/9335a741-9c2e-471b-b1e4-842dfaf1ed23/scratchpad/carousel/social'
mkdirSync(OUT, { recursive: true })

const base: ScriptSlide = { role: 'build', layout: 'cinematic', accent: 'white', eyebrow: '', title: '', body: '', cta_label: '', image_kind: 'none', image_prompt: '', testimonial_key: 'none', items: [] }

const slides: Array<[string, ScriptSlide, number]> = [
  ['cinematic', { ...base, role: 'hook', layout: 'cinematic', accent: 'red', eyebrow: 'Lo que nadie te cuenta al vender', title: 'USD 16.000 casi perdidos en la venta.', body: 'Y no fue por el precio de venta.' }, 1],
  ['infographic', { ...base, layout: 'infographic', accent: 'red', eyebrow: 'Dónde se va la plata', title: 'No se pierde en el precio. Se pierde acá:', items: [{ icon: 'tag', label: 'No sabés a cuánto CIERRA tu zona' }, { icon: 'clock', label: 'Aceptás la primera oferta' }, { icon: 'shield', label: 'Escritura sin blindar' }, { icon: 'hourglass', label: 'Vendés contra el reloj' }] }, 3],
  ['testimonial', { ...base, role: 'proof', layout: 'testimonial', accent: 'green', eyebrow: 'Lo que dicen los que ya vendieron', testimonial_key: 'claudia' }, 4],
  ['split', { ...base, role: 'cta', layout: 'split', accent: 'green', eyebrow: 'Antes de vender', title: 'Sabé cuánto te queda realmente en la mano.', body: 'Análisis de precio estratégico con Diego Ferreyra.', cta_label: 'Solicitá tu tasación' }, 5],
]

async function main() {
  for (const [name, slide, page] of slides) {
    const png = await composeSlide(slide, undefined, { page, total: 5 })
    writeFileSync(`${OUT}/compose-${name}.png`, png)
    console.log(`✓ compose-${name}.png (${(png.length / 1024).toFixed(0)} KB)`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
