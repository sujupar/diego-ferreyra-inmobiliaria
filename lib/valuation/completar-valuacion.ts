/**
 * Lo que el wizard agregaba a mano encima de `calculateValuation` (parte del
 * propietario, escenarios de compra, selección). Vive acá para que el Tasador
 * IA lo aplique EXACTAMENTE igual sobre su propio resultado: si difiriera, las
 * dos tarjetas no serían comparables.
 */
import type { PurchaseResult, PurchaseScenarioId, PurchaseScenarioInput, ValuationResult } from './calculator'
import { calculateAllScenarios } from './purchase-scenarios'

export interface OpcionesCompletarValuacion {
  ownerSharePercent: number
  purchaseScenarios: PurchaseScenarioInput[]
  selectedScenarioIds: PurchaseScenarioId[]
  /** purchaseResult legacy; se conserva SOLO si siguen existiendo escenarios. */
  previousPurchaseResult?: PurchaseResult
}

export function completarValuacion(base: ValuationResult, opts: OpcionesCompletarValuacion): ValuationResult {
  const ownerShareMoney = Math.round(base.moneyInHand * (opts.ownerSharePercent / 100))
  const calculados = opts.purchaseScenarios.length > 0
    ? calculateAllScenarios(opts.purchaseScenarios, ownerShareMoney)
    : undefined
  // Si no quedan escenarios, la selección se limpia: ids huérfanos harían que
  // el PDF intente renderizar tablas inexistentes.
  const escenarios = calculados && calculados.length > 0 ? calculados : undefined
  const seleccion = escenarios
    ? opts.selectedScenarioIds.filter(id => escenarios.some(s => s.id === id))
    : []
  return {
    ...base,
    purchaseResult: escenarios ? opts.previousPurchaseResult : undefined,
    purchaseScenarios: escenarios,
    selectedScenarioIds: seleccion,
    ownerSharePercent: opts.ownerSharePercent,
    ownerShareMoney,
  }
}
