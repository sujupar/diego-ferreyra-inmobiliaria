/**
 * Reglas para calcular el budget diario de una campaña Meta según el
 * precio de la propiedad. Rules-based (no LLM) para predictibilidad y
 * consistencia, además de evitar costos de inferencia.
 *
 * Los tiers están en USD (porque el currency interno suele ser USD).
 * El budget se devuelve en ARS porque la cuenta Meta opera en ARS.
 *
 * Configurable vía env vars o ajustando esta tabla directamente.
 * Tiers tentativos — a calibrar con Diego después de las primeras campañas.
 */

export interface BudgetTier {
  /** Precio máximo en USD para este tier (excluyente). null = sin tope */
  maxUsd: number | null
  /** Budget diario en ARS */
  dailyArs: number
  /** Etiqueta humana */
  label: string
}

const DEFAULT_TIERS: BudgetTier[] = [
  { maxUsd: 100_000, dailyArs: 5_000, label: 'Entry (<USD 100k)' },
  { maxUsd: 300_000, dailyArs: 10_000, label: 'Mid (USD 100-300k)' },
  { maxUsd: 600_000, dailyArs: 15_000, label: 'Upper (USD 300-600k)' },
  { maxUsd: null, dailyArs: 25_000, label: 'Premium (>USD 600k)' },
]

const USD_TO_ARS_DEFAULT = 1200 // fallback conservador si no hay env

function getUsdToArs(): number {
  const fromEnv = process.env.USD_TO_ARS
  if (fromEnv) {
    const n = parseFloat(fromEnv)
    if (Number.isFinite(n) && n > 0) return n
  }
  return USD_TO_ARS_DEFAULT
}

/**
 * Convierte el precio de la propiedad a USD (si no lo está ya).
 */
function priceInUsd(price: number, currency: string): number {
  if (currency === 'USD') return price
  if (currency === 'ARS') return price / getUsdToArs()
  // Fallback conservador: asumimos USD
  return price
}

export interface BudgetDecision {
  dailyArs: number
  tier: BudgetTier
  reasoning: string
}

/**
 * Calcula el budget diario para una propiedad.
 */
export function decideBudget(
  price: number,
  currency: string,
  tiers: BudgetTier[] = DEFAULT_TIERS,
): BudgetDecision {
  const usd = priceInUsd(price, currency)
  const tier =
    tiers.find(t => t.maxUsd === null || usd <= t.maxUsd) ?? tiers[tiers.length - 1]
  return {
    dailyArs: tier.dailyArs,
    tier,
    reasoning: `Precio USD ${usd.toFixed(0)} → tier "${tier.label}" → ARS ${tier.dailyArs}/día`,
  }
}

export { DEFAULT_TIERS as BUDGET_TIERS }
