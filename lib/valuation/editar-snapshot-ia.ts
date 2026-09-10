/**
 * Edición en línea del snapshot IA. Toca SOLO el snapshot: el resultado clásico
 * no se entera (y viceversa). La huella no cambia porque por esta vía no se
 * tocan precios ni superficies de las FILAS: lo que cambia es el juicio.
 */
import { calculateValuation, type ExpenseRates, type ValuationFeatures, type ValuationProperty } from './calculator'
import { completarValuacion } from './completar-valuacion'
import type { AiValuationResult } from './ia-tipos'

export type CambioSnapshotIA =
  | { tipo: 'subject'; features: ValuationFeatures }
  | { tipo: 'comparable'; index: number; features: ValuationFeatures }
  | { tipo: 'gastos'; expenseRates: Partial<ExpenseRates> }

/**
 * @param comparablesNormales las FILAS (precio, moneda, título); las features
 *   salen del snapshot, no de acá.
 */
export function recalcularSnapshotIA(
  snapshot: AiValuationResult,
  subject: ValuationProperty,
  comparablesNormales: ValuationProperty[],
  cambio: CambioSnapshotIA,
): AiValuationResult | null {
  if (cambio.tipo === 'comparable' && (cambio.index < 0 || cambio.index >= snapshot.ai.comparables.length)) return null

  const subjectFeatures = cambio.tipo === 'subject' ? cambio.features : snapshot.ai.subject.features
  const comparables = snapshot.ai.comparables.map((c, i) =>
    cambio.tipo === 'comparable' && cambio.index === i ? { ...c, features: cambio.features } : c)
  const expenseRates: ExpenseRates = cambio.tipo === 'gastos'
    ? { ...snapshot.expenseRates, ...cambio.expenseRates }
    : snapshot.expenseRates

  const base = calculateValuation({
    subject: { ...subject, features: subjectFeatures },
    comparables: comparablesNormales.map((fila, i) => ({ ...fila, features: comparables[i]?.features ?? fila.features })),
    expenseRates,
  })
  if (!base) return null
  const completo = completarValuacion(base, {
    ownerSharePercent: snapshot.ownerSharePercent ?? 100,
    purchaseScenarios: snapshot.purchaseScenarios ?? [],
    selectedScenarioIds: snapshot.selectedScenarioIds ?? [],
    previousPurchaseResult: snapshot.purchaseResult,
  })
  return {
    ...completo,
    ai: { ...snapshot.ai, subject: { ...snapshot.ai.subject, features: subjectFeatures }, comparables },
  }
}
