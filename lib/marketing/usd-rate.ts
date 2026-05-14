/**
 * Obtiene el tipo de cambio USD→ARS automáticamente desde Bluelytics
 * (API pública, sin auth: https://api.bluelytics.com.ar/v2/latest).
 *
 * Usa el dólar blue (promedio compra/venta) que es el referencial usado
 * en real estate argentino. Si Bluelytics no responde, fallback al
 * oficial, después a env var USD_TO_ARS, después a 1200 (último recurso).
 *
 * Caché in-memory de 1h por proceso. Los workers son cortos pero esto
 * evita golpear la API en cada job dentro del mismo tick.
 */

interface CachedRate {
  arsPerUsd: number
  source: RateSource
  fetchedAt: number
}

export type RateSource = 'blue' | 'oficial' | 'env' | 'default'

let cache: CachedRate | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1h

const DEFAULT_FALLBACK = 1200

interface BluelyticsResponse {
  blue?: { value_avg: number; value_buy: number; value_sell: number }
  oficial?: { value_avg: number; value_buy: number; value_sell: number }
}

export interface UsdRateResult {
  rate: number
  source: RateSource
  fetchedAt: number
}

export async function getUsdToArs(): Promise<UsdRateResult> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { rate: cache.arsPerUsd, source: cache.source, fetchedAt: cache.fetchedAt }
  }

  // Env override útil para tests/dev (precedencia mayor que API)
  const fromEnv = process.env.USD_TO_ARS
  if (fromEnv) {
    const n = parseFloat(fromEnv)
    if (Number.isFinite(n) && n > 0) {
      cache = { arsPerUsd: n, source: 'env', fetchedAt: Date.now() }
      return { rate: n, source: 'env', fetchedAt: cache.fetchedAt }
    }
  }

  try {
    const res = await fetch('https://api.bluelytics.com.ar/v2/latest', {
      signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json' },
    })
    if (res.ok) {
      const data = (await res.json()) as BluelyticsResponse
      const blue = data.blue?.value_avg
      const oficial = data.oficial?.value_avg
      if (blue && Number.isFinite(blue) && blue > 0) {
        cache = { arsPerUsd: blue, source: 'blue', fetchedAt: Date.now() }
        return { rate: blue, source: 'blue', fetchedAt: cache.fetchedAt }
      }
      if (oficial && Number.isFinite(oficial) && oficial > 0) {
        cache = { arsPerUsd: oficial, source: 'oficial', fetchedAt: Date.now() }
        return { rate: oficial, source: 'oficial', fetchedAt: cache.fetchedAt }
      }
    }
  } catch (err) {
    console.warn('[usd-rate] bluelytics fetch failed', err)
  }

  cache = { arsPerUsd: DEFAULT_FALLBACK, source: 'default', fetchedAt: Date.now() }
  return { rate: DEFAULT_FALLBACK, source: 'default', fetchedAt: cache.fetchedAt }
}

/**
 * Test helper: limpia la caché entre tests.
 */
export function __clearCache(): void {
  cache = null
}
