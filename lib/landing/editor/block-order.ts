/**
 * E1.6 Editor — orden curado de la plantilla de lujo (por id de bloque) y helpers
 * para insertar/quitar bloques OPCIONALES manteniendo el orden. NO permite bloques
 * arbitrarios: sólo se insertan bloques cuyo id ∈ CURATED_ORDER.
 */
import type { LandingBlock } from '@/lib/landing/schema'

export const CURATED_ORDER: readonly string[] = [
  'hero', 'stats', 'story', 'gallery', 'plans', 'cta-mid', 'location', 'closing', 'footer',
]

function rank(id: string): number {
  const i = CURATED_ORDER.indexOf(id)
  return i < 0 ? Number.MAX_SAFE_INTEGER : i
}

export function removeBlockById(blocks: LandingBlock[], id: string): LandingBlock[] {
  return blocks.filter((b) => b.id !== id)
}

/**
 * Inserta `block` en la posición canónica: justo antes del primer bloque cuyo rank
 * es mayor. Idempotente (si ya existe, lo reemplaza en su lugar canónico).
 */
export function insertBlockInCuratedOrder(blocks: LandingBlock[], block: LandingBlock): LandingBlock[] {
  const without = removeBlockById(blocks, block.id)
  const r = rank(block.id)
  let insertAt = without.length
  for (let i = 0; i < without.length; i++) {
    if (rank(without[i].id) > r) { insertAt = i; break }
  }
  return [...without.slice(0, insertAt), block, ...without.slice(insertAt)]
}
