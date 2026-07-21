// Smoke test de lib/social/openai: texto→JSON + generación de imagen.
// Correr: node --env-file=.env.local --import tsx scripts/social/smoke-openai.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { openaiText, generateBackground } from '../../lib/social/openai'

const OUT = '/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/9335a741-9c2e-471b-b1e4-842dfaf1ed23/scratchpad/carousel/social'
mkdirSync(OUT, { recursive: true })

async function main() {
  console.log('[texto] llamando openaiText…')
  const out = await openaiText<{ greeting: string; slides: number }>(
    'Sos un asistente que responde SOLO en JSON válido.',
    'Devolveme un saludo corto en español y el número 5.',
    { name: 'smoke', schema: { type: 'object', properties: { greeting: { type: 'string' }, slides: { type: 'integer' } }, required: ['greeting', 'slides'], additionalProperties: false } },
  )
  console.log('[texto] OK →', JSON.stringify(out))

  console.log('[imagen] generando 1 escena (calidad baja)…')
  const png = await generateBackground('Un fajo de billetes de dólar sobre una superficie oscura, luz dramática, fondo azul marino, fotorrealista. Sin texto.', { size: '1024x1024', quality: 'low' })
  writeFileSync(`${OUT}/smoke-openai.png`, png)
  console.log(`[imagen] OK → smoke-openai.png (${(png.length / 1024).toFixed(0)} KB)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
