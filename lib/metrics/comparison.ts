import 'server-only'
import type { RangeFilter, FunnelMetrics, MetricsComparison } from './types'
import { getFunnelMetrics, type FunnelOptions } from './funnel'
import { FUNNEL_METRIC_KEYS } from './types'

/**
 * Devuelve el rango inmediatamente anterior al provisto, del mismo largo en
 * días. Ej.: 2026-05-11 → 2026-05-17 (7 días) → 2026-05-04 → 2026-05-10.
 */
export function calculatePreviousRange(range: RangeFilter): RangeFilter {
  const from = new Date(range.from + 'T00:00:00Z')
  const to = new Date(range.to + 'T00:00:00Z')
  const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  const prevTo = new Date(from)
  prevTo.setUTCDate(prevTo.getUTCDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setUTCDate(prevFrom.getUTCDate() - diffDays)
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  }
}

/**
 * Devuelve delta % entre current y previous, redondeado a entero.
 * Convenciones:
 *   - 0 → 0  → null (sin variación significativa)
 *   - 0 → N  → Infinity (no se puede calcular % de "0")
 *   - N → 0  → -100
 *   - resto  → ((cur - prev) / prev) * 100
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (current === 0 && previous === 0) return null
  if (previous === 0) return Infinity
  return Math.round(((current - previous) / previous) * 100)
}

export async function getFunnelComparison(
  range: RangeFilter,
  opts: FunnelOptions = {},
): Promise<MetricsComparison<FunnelMetrics>> {
  const previousRange = calculatePreviousRange(range)
  const [current, previous] = await Promise.all([
    getFunnelMetrics(range, opts),
    getFunnelMetrics(previousRange, opts),
  ])
  const delta_pct: Partial<Record<keyof FunnelMetrics, number>> = {}
  for (const k of FUNNEL_METRIC_KEYS) {
    const d = deltaPercent(current[k], previous[k])
    if (d !== null) delta_pct[k] = d
  }
  return { current, previous, delta_pct }
}
