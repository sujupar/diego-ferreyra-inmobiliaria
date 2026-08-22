/**
 * Re-renderiza SOLO las imágenes de HISTORIAS (9:16) de Roque Pérez con el template
 * hero corregido (degradado más compacto y bajo). Usa las fotos mejoradas cacheadas.
 * Modo 'preview' → scratchpad (para mirar); modo 'deliver' → carpeta de Downloads.
 * Correr: node --env-file=.env.local --import tsx scripts/render-roque-historias.ts preview
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { Client } from 'pg'
import { renderOverlayPiece, paletteFor } from '../lib/marketing/ad-image-typography-overlay'
import { normalizePropertyTypeLabel, operationLabelFor } from '../lib/marketing/ad-image-generator-v2'
import { downloadAdEnhanced } from '../lib/social/storage'
import type { CompositionStyle } from '../lib/marketing/ad-image-prompts'

const JOB = '6216f09b-5882-4a5b-a3e2-8c6fc6d2847f'
const PROP = '863b43c5-c107-4b9e-963d-8e9d6f8b4bb9'
const STARRED = [0, 1, 21]
const STYLES: { idx: number; style: CompositionStyle }[] = [
  { idx: 0, style: 'editorial_magazine' },
  { idx: 1, style: 'hero_full_bleed' },
]
const PREVIEW = '/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/ac7949b2-002a-4fb2-a997-01cbf673a880/scratchpad/roque-render'
const DELIVER = '/Users/apple/Downloads/roque-perez-casa-imagenes'

// (photo_styleIdx) → nombre de archivo del export (para SObreescribir la historia vieja).
const PS_TO_FILE: Record<string, string> = {
  '1_1': 'Ad-4-Ubicacin-estratgica-en-Coghlan',
  '0_1': 'Ad-2-264-m-cubiertos',
  '21_1': 'Ad-6-6-ambientes-amplios',
  '0_0': 'Ad-1-6-ambientes-amplios',
  '1_0': 'Ad-3-Ubicacin-estratgica-en-Coghlan',
  '21_0': 'Ad-5-Ubicacin-estratgica-en-Coghlan',
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(price)
}

async function main() {
  const mode = process.argv[2] ?? 'preview'
  const OUT = mode === 'deliver' ? DELIVER : PREVIEW
  mkdirSync(OUT, { recursive: true })

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const p = (await c.query(
    `SELECT property_type, operation_type, neighborhood, asking_price, currency, rooms, bedrooms, covered_area, floor, photos
     FROM properties WHERE id=$1`, [PROP])).rows[0]
  await c.end()

  const specsParts: string[] = []
  if (p.rooms) specsParts.push(`${p.rooms} amb`)
  if (p.bedrooms) specsParts.push(`${p.bedrooms} dorm`)
  if (p.covered_area) specsParts.push(`${p.covered_area} m²`)
  if (p.floor != null) specsParts.push(`piso ${p.floor}`)
  if (p.neighborhood) specsParts.push(p.neighborhood)

  const tokens = {
    propertyType: normalizePropertyTypeLabel(p.property_type),          // "Casa"
    operationLabel: operationLabelFor(p.operation_type),                 // "En venta"
    headline: `${normalizePropertyTypeLabel(p.property_type)} en ${p.neighborhood}`, // "Casa en Coghlan"
    price: formatPrice(p.asking_price, p.currency),
    specs: specsParts.join(' · '),
    neighborhood: p.neighborhood,
  }
  const palette = paletteFor('luminoso')

  for (const photoIdx of STARRED) {
    // Foto mejorada cacheada; si falta, la foto original.
    let buf = await downloadAdEnhanced(JOB, photoIdx)
    if (!buf) {
      const url = (p.photos as string[])[photoIdx]
      buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    }
    for (const { idx: styleIdx, style } of STYLES) {
      const png = await renderOverlayPiece({
        photoBuffer: buf, photoMime: 'image/jpeg', format: 'story_vertical', style, tokens, palette,
      })
      const base = mode === 'deliver'
        ? (PS_TO_FILE[`${photoIdx}_${styleIdx}`] ?? `HISTORIA_foto${photoIdx}_s${styleIdx}`)
        : `HISTORIA_foto${photoIdx}_${style === 'hero_full_bleed' ? 'hero' : 'editorial'}`
      const fname = `${base}__historias-9x16.jpg`
      writeFileSync(`${OUT}/${fname}`, png)
      console.log(`✓ ${fname} (${(png.length / 1024).toFixed(0)} KB)`)
    }
  }
  console.log(`\nSalida en: ${OUT}`)
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
