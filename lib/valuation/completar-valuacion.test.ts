import { describe, it, expect } from 'vitest'
import { completarValuacion } from './completar-valuacion'
import { buildDefaultScenarios, calculateAllScenarios } from './purchase-scenarios'
import type { ValuationResult, PurchaseResult } from './calculator'

const base = {
  moneyInHand: 100_000, publicationPrice: 120_000, saleValue: 114_000, currency: 'USD',
} as unknown as ValuationResult

describe('completarValuacion — lo que el wizard agregaba a mano', () => {
  it('calcula la parte del propietario y el dinero disponible', () => {
    const r = completarValuacion(base, { ownerSharePercent: 50, purchaseScenarios: [], selectedScenarioIds: [] })
    expect(r.ownerSharePercent).toBe(50)
    expect(r.ownerShareMoney).toBe(50_000)
  })

  it('sin escenarios: purchaseScenarios undefined, selectedScenarioIds vacío, purchaseResult se descarta', () => {
    const legacy = { total: 1 } as unknown as PurchaseResult
    const r = completarValuacion(base, {
      ownerSharePercent: 100, purchaseScenarios: [], selectedScenarioIds: ['prop_0:medium'], previousPurchaseResult: legacy,
    })
    expect(r.purchaseScenarios).toBeUndefined()
    expect(r.selectedScenarioIds).toEqual([])
    expect(r.purchaseResult).toBeUndefined()
  })

  it('con escenarios: los calcula sobre la parte del propietario y filtra la selección a ids existentes', () => {
    const escenarios = buildDefaultScenarios(200_000, 'prop_0', 'Depto A')
    const legacy = { total: 1 } as unknown as PurchaseResult
    const r = completarValuacion(base, {
      ownerSharePercent: 50, purchaseScenarios: escenarios,
      selectedScenarioIds: ['prop_0:medium', 'prop_9:aggressive'], previousPurchaseResult: legacy,
    })
    expect(r.purchaseScenarios).toEqual(calculateAllScenarios(escenarios, 50_000))
    expect(r.selectedScenarioIds).toEqual(['prop_0:medium'])
    expect(r.purchaseResult).toBe(legacy)
  })

  it('redondea el dinero del propietario como el wizard (Math.round)', () => {
    const r = completarValuacion({ ...base, moneyInHand: 100_001 } as ValuationResult, {
      ownerSharePercent: 33, purchaseScenarios: [], selectedScenarioIds: [],
    })
    expect(r.ownerShareMoney).toBe(Math.round(100_001 * 0.33))
  })
})
