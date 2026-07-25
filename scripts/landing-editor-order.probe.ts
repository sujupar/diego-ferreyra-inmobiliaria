/**
 * E1.6 — Probe de lógica pura de orden/patch de bloques del editor (sin DB).
 * Correr: node --env-file=.env.local --import tsx scripts/landing-editor-order.probe.ts
 */
import { CURATED_ORDER, insertBlockInCuratedOrder, removeBlockById } from '../lib/landing/editor/block-order'
import { replaceBlockById, patchStoryItem } from '../lib/landing/editor/block-patch'
import type { LandingBlock } from '../lib/landing/schema'

const base: LandingBlock[] = [
  { id: 'hero', type: 'hero' },
  { id: 'stats', type: 'stats_bar' },
  { id: 'story', type: 'story_blocks', items: [{ numeral: 'I', eyebrow: 'a', headline: 'b', body: 'c', tie: 'propiedad' }] },
  { id: 'cta-mid', type: 'closing_invite', headline: 'x' },
  { id: 'location', type: 'location_showcase' },
  { id: 'closing', type: 'closing_invite', headline: 'y' },
  { id: 'footer', type: 'footer_brand' },
]

// Insertar 'gallery' debe caer entre 'story' (rank 2) y 'cta-mid' (rank 5).
const withGallery = insertBlockInCuratedOrder(base, {
  id: 'gallery', type: 'curated_gallery', photoIndices: [1, 2],
})
const ids = withGallery.map((b) => b.id).join(',')
if (ids !== 'hero,stats,story,gallery,cta-mid,location,closing,footer')
  throw new Error('orden incorrecto tras insertar gallery: ' + ids)

// Insertar 'plans' (rank 4) cae entre gallery (3) y cta-mid (5).
const withPlans = insertBlockInCuratedOrder(withGallery, { id: 'plans', type: 'floor_plans' })
const ids2 = withPlans.map((b) => b.id).join(',')
if (ids2 !== 'hero,stats,story,gallery,plans,cta-mid,location,closing,footer')
  throw new Error('orden incorrecto tras insertar plans: ' + ids2)

// Quitar 'gallery' vuelve sin ella.
const back = removeBlockById(withGallery, 'gallery').map((b) => b.id).join(',')
if (back !== 'hero,stats,story,cta-mid,location,closing,footer')
  throw new Error('removeBlockById falló: ' + back)

// Idempotencia: insertar 'location' cuando ya está no duplica y respeta la posición.
const reins = insertBlockInCuratedOrder(base, { id: 'location', type: 'location_showcase', eyebrow: 'Z' })
if (reins.filter((b) => b.id === 'location').length !== 1) throw new Error('insert duplicó location')
if (reins.map((b) => b.id).join(',') !== base.map((b) => b.id).join(','))
  throw new Error('insert idempotente cambió el orden: ' + reins.map((b) => b.id).join(','))

// replaceBlockById cambia el bloque manteniendo posición.
const replaced = replaceBlockById(base, 'cta-mid', { id: 'cta-mid', type: 'closing_invite', headline: 'NUEVO' })
const mid = replaced.find((b) => b.id === 'cta-mid') as Extract<LandingBlock, { type: 'closing_invite' }>
if (mid.headline !== 'NUEVO') throw new Error('replaceBlockById no reemplazó')
if (replaced.map((b) => b.id).join(',') !== base.map((b) => b.id).join(','))
  throw new Error('replaceBlockById cambió el orden')

// patchStoryItem edita un item puntual sin tocar los otros.
const story = base[2] as Extract<LandingBlock, { type: 'story_blocks' }>
const patched = patchStoryItem(story, 0, { headline: 'B2', photoIndex: 3 })
if (patched.items[0].headline !== 'B2' || patched.items[0].photoIndex !== 3)
  throw new Error('patchStoryItem no aplicó el patch')
if (patched.items[0].eyebrow !== 'a') throw new Error('patchStoryItem pisó otros campos')

if (CURATED_ORDER[0] !== 'hero' || CURATED_ORDER[CURATED_ORDER.length - 1] !== 'footer')
  throw new Error('CURATED_ORDER inesperado')

console.log('OK block-order + block-patch')
