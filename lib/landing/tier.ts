/**
 * E1.9 — Tier de la landing: cuánta "intensidad" desplegar según el valor de la
 * propiedad. alto_valor = despliegue pleno (galería destacada, etc.); estándar =
 * mismo pulido pero más al grano. Mismo umbral que deriveFunnelType.
 */
import type { LandingProperty } from '@/lib/landing/registry'

export type LandingTier = 'alto_valor' | 'estandar'

const ALTO_VALOR_USD = 400_000

export function deriveTier(property: LandingProperty): LandingTier {
  const price = property.asking_price ?? 0
  const usd = (property.currency ?? 'USD').toUpperCase() === 'USD' ? price : 0
  return usd >= ALTO_VALOR_USD ? 'alto_valor' : 'estandar'
}

export interface TierConfig {
  /** Cuántos bloques de historia como máximo. */
  storyCount: 2 | 3
  /** Variante de galería: 'feature' (1 destacada 2×2) o 'grid' (uniforme). */
  gallery: 'feature' | 'grid'
}

export function tierConfig(tier: LandingTier): TierConfig {
  // alto_valor despliega los 3 bloques de historia; estándar va más al grano (2).
  return tier === 'alto_valor'
    ? { storyCount: 3, gallery: 'feature' }
    : { storyCount: 2, gallery: 'grid' }
}
