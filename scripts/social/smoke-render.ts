// Smoke test: verifica que lib/social (render + kit) genera un PNG server-side.
// Correr: node --import tsx scripts/social/smoke-render.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { h, renderSlide } from '../../lib/social/render'
import { C, cinematicBase, eyebrow, footer, spacer, SCRIM } from '../../lib/social/kit'

const OUT = '/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/9335a741-9c2e-471b-b1e4-842dfaf1ed23/scratchpad/carousel/social'
mkdirSync(OUT, { recursive: true })

async function main() {
  const slide = cinematicBase(undefined, SCRIM.bottom, [
    spacer(),
    eyebrow('Smoke test · lib/social', C.red),
    h('div', { style: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 72, lineHeight: 1.1, color: '#ffffff', marginTop: 12 } }, 'El kit funciona en el server.'),
    h('div', { style: { fontFamily: 'Lato', fontWeight: 400, fontSize: 33, color: C.onDark, marginTop: 16 } }, 'Montserrat + Lato desde public/fonts, satori + resvg.'),
    footer({ swipe: true }),
  ])
  const png = await renderSlide(slide)
  writeFileSync(`${OUT}/smoke.png`, png)
  console.log(`✓ smoke.png (${(png.length / 1024).toFixed(0)} KB) → ${OUT}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
