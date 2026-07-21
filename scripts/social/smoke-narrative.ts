// Smoke test del motor narrativo: genera un guion de largo variable y lo imprime.
// Correr: node --env-file=.env.local --import tsx scripts/social/smoke-narrative.ts
import { generateScript } from '../../lib/social/narrative'

async function main() {
  const script = await generateScript({
    topic: 'Por qué publicar tu propiedad en varios portales al mismo precio te hace vender peor',
    structure: 'auto',
    targetLength: 8,
    ctaType: 'campaign',
    diegoEnabled: true,
  })

  console.log('TÍTULO:', script.title)
  console.log('CAPTION:', script.caption)
  console.log('HASHTAGS:', script.hashtags.join(' '))
  console.log('SLIDES:', script.slides.length)
  console.log('─'.repeat(70))
  script.slides.forEach((s, i) => {
    console.log(`\n[${i + 1}] role=${s.role} layout=${s.layout} accent=${s.accent} img=${s.image_kind}${s.testimonial_key !== 'none' ? ' testim=' + s.testimonial_key : ''}`)
    if (s.eyebrow) console.log('   eyebrow:', s.eyebrow)
    if (s.title) console.log('   title  :', s.title)
    if (s.body) console.log('   body   :', s.body)
    if (s.cta_label) console.log('   cta    :', s.cta_label)
    if (s.items.length) console.log('   items  :', s.items.map((it) => `${it.icon}:${it.label}`).join(' | '))
    if (s.image_prompt) console.log('   img    :', s.image_prompt.slice(0, 120) + '…')
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
