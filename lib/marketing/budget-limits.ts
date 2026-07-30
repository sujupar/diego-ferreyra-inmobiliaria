/**
 * Límites y validación de presupuesto diario de campañas Meta (E2.0 — blindaje).
 *
 * REGLA DE ORO: `daily_budget_ars` viaja como ENTERO en PESOS ARGENTINOS en
 * TODA la app. La conversión a la unidad mínima de Meta (×100) ocurre EXACTAMENTE
 * UNA VEZ, en lib/marketing/meta-campaign-builder.ts (línea del `daily_budget`).
 * NUNCA multiplicar por 100 en ningún otro lado. Un cero de más nos deja en la
 * quiebra — este archivo es la única fuente de verdad de los rangos.
 *
 * Verificación en código: debe existir un solo `* 100` sobre budget en lib/marketing.
 */

/**
 * Mínimo diario en ARS que la app deja elegir.
 *
 * Mínimos OFICIALES de Meta para ARS, consultados a la API el 2026-07-31
 * (`GET /act_X/minimum_budgets`), en pesos:
 *   - por impresiones ............ 1.500,38
 *   - eventos de alta frecuencia .. 3.750,95
 *   - eventos de baja frecuencia . 30.007,55  ← conversiones
 *
 * Nuestras campañas optimizan por CONVERSIONES, así que el número "de manual"
 * sería 30.007. En la práctica Meta acepta bastante menos (la campaña del
 * 2026-07-30 se creó con 3.000 sin chistar), así que dejamos elegir desde el
 * piso absoluto de la moneda y AVISAMOS cuando está por debajo de lo
 * recomendado, en vez de bloquear. Decisión del usuario: todavía no conocemos
 * el rendimiento y quiere empezar chico.
 */
export const META_MIN_DAILY_ARS = Number(process.env.META_MIN_DAILY_ARS ?? 1_501)

/**
 * Debajo de esto Meta puede no entregar bien una campaña de conversiones: no se
 * bloquea, se avisa. Es el mínimo de "eventos de alta frecuencia" de Meta,
 * redondeado — por debajo, el conjunto suele no salir del aprendizaje.
 */
export const META_RECOMMENDED_MIN_DAILY_ARS = Number(
  process.env.META_RECOMMENDED_MIN_DAILY_ARS ?? 3_751,
)

/** ¿Este presupuesto es válido pero arriesgado para entregar? (no bloquea) */
export function budgetBelowRecommended(dailyArs: number): boolean {
  return dailyArs >= META_MIN_DAILY_ARS && dailyArs < META_RECOMMENDED_MIN_DAILY_ARS
}

/** Máximo diario de negocio en ARS. Presets y slider del wizard no pasan de acá. */
export const META_MAX_DAILY_ARS = Number(process.env.META_MAX_DAILY_ARS ?? 60_000)

/**
 * Techo ABSOLUTO catastrófico en ARS/día. Es un backstop de último recurso,
 * independiente del MAX de negocio: aunque un caller futuro se saltee la
 * validación, el builder tira si el budget supera esto. 10× el MAX de negocio.
 */
export const META_ABSOLUTE_CEILING_ARS = 600_000

/** Presets que ofrece el wizard (deben caer dentro de [MIN, MAX]). */
export const BUDGET_PRESETS_ARS = [2_000, 5_000, 10_000, 15_000, 25_000, 50_000] as const

export interface BudgetValidation {
  ok: boolean
  /** Motivo legible si !ok (para logs / error_message). */
  reason?: string
  /** Código estable para el front / tests. */
  code?: 'NOT_INTEGER' | 'BELOW_MIN' | 'ABOVE_MAX' | 'NAN'
}

/**
 * Valida un presupuesto diario en ARS (entero) contra los límites de negocio.
 * NO muta ni convierte — solo valida. Usar en save-input y confirm antes de
 * tocar la API de Meta.
 */
export function validateDailyBudgetArs(value: unknown): BudgetValidation {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, code: 'NAN', reason: 'El presupuesto no es un número válido.' }
  }
  if (!Number.isInteger(value)) {
    return { ok: false, code: 'NOT_INTEGER', reason: 'El presupuesto debe ser un entero en ARS (sin centavos).' }
  }
  if (value < META_MIN_DAILY_ARS) {
    return { ok: false, code: 'BELOW_MIN', reason: `El presupuesto mínimo es ARS ${META_MIN_DAILY_ARS.toLocaleString('es-AR')}/día.` }
  }
  if (value > META_MAX_DAILY_ARS) {
    return { ok: false, code: 'ABOVE_MAX', reason: `El presupuesto máximo es ARS ${META_MAX_DAILY_ARS.toLocaleString('es-AR')}/día.` }
  }
  return { ok: true }
}

/** Formato "$X/día ≈ $Y/mes" para la confirmación del wizard. */
export function formatBudgetSummary(dailyArs: number): { perDay: string; perMonth: string } {
  const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
  return {
    perDay: `$${nf.format(dailyArs)}`,
    perMonth: `$${nf.format(dailyArs * 30)}`,
  }
}
