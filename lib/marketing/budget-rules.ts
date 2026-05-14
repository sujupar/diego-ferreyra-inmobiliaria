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

/**
 * Convierte el precio de la propiedad a USD (si no lo está ya).
 * El rate USD→ARS se inyecta para mantener la función pura/testeable.
 * Quien orquesta llama a getUsdToArs() (lib/marketing/usd-rate.ts) primero
 * y pasa el resultado acá.
 */
function priceInUsd(price: number, currency: string, usdToArs: number): number {
  if (currency === 'USD') return price
  if (currency === 'ARS') return price / usdToArs
  return price // fallback: asumimos USD
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
  usdToArs: number,
  tiers: BudgetTier[] = DEFAULT_TIERS,
): BudgetDecision {
  const usd = priceInUsd(price, currency, usdToArs)
  const tier =
    tiers.find(t => t.maxUsd === null || usd <= t.maxUsd) ?? tiers[tiers.length - 1]
  return {
    dailyArs: tier.dailyArs,
    tier,
    reasoning: `Precio USD ${usd.toFixed(0)} → tier "${tier.label}" → ARS ${tier.dailyArs}/día`,
  }
}

export { DEFAULT_TIERS as BUDGET_TIERS }
