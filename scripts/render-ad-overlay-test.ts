/**
 * Verificación visual del overlay (badge "En venta" + tipo capitalizado).
 * Renderiza editorial + hero en 4:5 con una foto real y escribe PNGs para inspección.
 * Correr: node --env-file=.env.local --import tsx scripts/render-ad-overlay-test.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { Client } from 'pg'
import { renderOverlayPiece, paletteFor } from '../lib/marketing/ad-image-typography-overlay'
import { normalizePropertyTypeLabel, operationLabelFor } from '../lib/marketing/ad-image-generator-v2'

const OUT =
  '/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/ac7949b2-002a-4fb2-a997-01cbf673a880/scratchpad/ad-overlay'

async function main() {
  mkdirSync(OUT, { recursive: true })
  // Foto real de la propiedad Villa Pueyrredón
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const r = await c.query(
    `SELECT photos[1] AS photo, property_type, operation_type, neighborhood, asking_price, currency
     FROM properties WHERE id=$1`, ['74d1772d-e572-4b4e-b3f0-08bbc52b14ce'],
  )
  await c.end()
  const row = r.rows[0]
  const photoRes = await fetch(row.photo)
  const photoBuffer = Buffer.from(await photoRes.arrayBuffer())

  const tokens = {
    propertyType: normalizePropertyTypeLabel(row.property_type), // "Departamento"
    operationLabel: operationLabelFor(row.operation_type), // "En venta"
    // Simula el fallback (avatar sin hooks) que causaba "departamento en ..." minúscula:
    headline: `${normalizePropertyTypeLabel(row.property_type)} en ${row.neighborhood}`,
    price: new Intl.NumberFormat('es-AR', { style: 'currency', currency: row.currency || 'USD', maximumFractionDigits: 0 }).format(row.asking_price),
    specs: '1 amb · 36 m² · piso 3 · Villa Pueyrredón',
    neighborhood: row.neighborhood,
  }
  console.log('tokens:', JSON.stringify({ propertyType: tokens.propertyType, operationLabel: tokens.operationLabel, headline: tokens.headline }))
  const palette = paletteFor('luminoso')

  for (const style of ['editorial_magazine', 'hero_full_bleed'] as const) {
    for (const format of ['feed_vertical', 'story_vertical'] as const) {
      const png = await renderOverlayPiece({ photoBuffer, photoMime: 'image/jpeg', format, style, tokens, palette })
      const path = `${OUT}/${style}__${format}.png`
      writeFileSync(path, png)
      console.log(`✓ ${style} ${format} (${(png.length / 1024).toFixed(0)} KB)`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
