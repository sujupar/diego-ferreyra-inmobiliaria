// Smoke test de integración: guion → insertar carrusel+slides → processNextSlide
// en loop → descargar un PNG compuesto de Storage.
// Correr: node --env-file=.env.local --import tsx scripts/social/smoke-generate.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { generateScript } from '../../lib/social/narrative'
import { slideToRow, processNextSlide } from '../../lib/social/generate'
import { admin, signedUrl, downloadPng } from '../../lib/social/storage'

const OUT = '/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/9335a741-9c2e-471b-b1e4-842dfaf1ed23/scratchpad/carousel/social/gen'
mkdirSync(OUT, { recursive: true })

async function main() {
  const db = admin()

  console.log('1) generando guion…')
  const script = await generateScript({
    topic: 'Cuánta plata REAL te queda en la mano después de vender tu departamento (no el precio de venta)',
    structure: 'aversion',
    targetLength: 5,
    ctaType: 'campaign',
    diegoEnabled: true,
  })
  console.log(`   guion: ${script.slides.length} slides — "${script.title}"`)

  console.log('2) insertando carrusel + slides…')
  const { data: carousel, error } = await db.from('social_carousels').insert({
    topic: 'smoke test aversión', structure: 'aversion', target_length: 5, cta_type: 'campaign',
    diego_enabled: true, status: 'generating_images', title: script.title,
    script, caption: script.caption, hashtags: script.hashtags,
  }).select('id').single()
  if (error) throw new Error('insert carousel: ' + error.message)
  const id = (carousel as any).id
  console.log('   carousel id:', id)

  const rows = script.slides.map((s, i) => ({ carousel_id: id, ...slideToRow(s, i + 1) }))
  const { error: e2 } = await db.from('social_carousel_slides').insert(rows)
  if (e2) throw new Error('insert slides: ' + e2.message)

  console.log('3) procesando slide por slide (continuación del lado del cliente)…')
  let guard = 0
  while (guard++ < 25) {
    const r = await processNextSlide(id)
    console.log(`   → progreso ${r.progress}%${r.done ? ' ✓ done' : ''}`)
    if (r.done) break
  }

  console.log('4) verificando PNG en Storage…')
  const buf = await downloadPng(`${id}/slide-1.png`)
  writeFileSync(`${OUT}/gen-slide-1.png`, buf)
  const url = await signedUrl(`${id}/slide-1.png`)
  console.log(`   ✓ slide-1.png bajado (${(buf.length / 1024).toFixed(0)} KB); signed URL OK: ${url ? 'sí' : 'no'}`)
  console.log('   carousel id para inspección:', id)
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
