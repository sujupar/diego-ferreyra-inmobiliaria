import { describe, it, expect } from 'vitest'
import { recalcularSnapshotIA } from './editar-snapshot-ia'
import { calculateValuation, type ValuationProperty } from './calculator'
import { completarValuacion } from './completar-valuacion'
import type { AiValuationResult } from './ia-tipos'

const subject: ValuationProperty = {
  price: null, currency: 'USD',
  features: { coveredArea: 60, floor: 3, age: 20, quality: 'GOOD', conservationState: 'STATE_2', disposition: 'FRONT' },
}
const filas: ValuationProperty[] = [
  { price: 120_000, currency: 'USD', title: 'A', features: { coveredArea: 55, floor: 2, age: 30 } },
  { price: 150_000, currency: 'USD', title: 'B', features: { coveredArea: 65, floor: 6, age: 50 } },
  { price: 99_000, currency: 'USD', title: 'C', features: { coveredArea: 50, floor: 1, age: 60 } },
]
const featIA = [
  { coveredArea: 55, floor: 2, age: 30, quality: 'GOOD' as const, conservationState: 'STATE_2' as const, disposition: 'FRONT' as const, locationCoefficient: 1 },
  { coveredArea: 65, floor: 6, age: 50, quality: 'GOOD' as const, conservationState: 'STATE_3' as const, disposition: 'BACK' as const, locationCoefficient: 1 },
  { coveredArea: 50, floor: 1, age: 60, quality: 'ECONOMIC' as const, conservationState: 'STATE_3' as const, disposition: 'FRONT' as const, locationCoefficient: 0.95 },
]
function snapshotBase(): AiValuationResult {
  const base = calculateValuation({
    subject, comparables: filas.map((f, i) => ({ ...f, features: featIA[i] })), expenseRates: { saleDiscountPercent: 5 },
  })
  if (!base) throw new Error('el caso base tiene que ser calculable')
  return {
    ...completarValuacion(base, { ownerSharePercent: 50, purchaseScenarios: [], selectedScenarioIds: [] }),
    ai: {
      provider: 'p', model: 'm', generatedAt: 'g', confidence: 'alta', summary: 's', inputFingerprint: 'huella',
      subject: { features: subject.features, reasoning: 'r0' },
      comparables: featIA.map((f, i) => ({ features: f, reasoning: `r${i + 1}` })),
    },
  }
}

describe('recalcularSnapshotIA', () => {
  it('cambiar la calidad de un comparable recalcula SOLO ese y conserva el resto del snapshot', () => {
    const s = snapshotBase()
    const r = recalcularSnapshotIA(s, subject, filas, { tipo: 'comparable', index: 0, features: { ...featIA[0], quality: 'EXCELLENT' } })
    expect(r).not.toBeNull()
    expect(r!.comparableAnalysis[0].qualityCoefficient).toBe(1.275)
    expect(r!.comparableAnalysis[1].qualityCoefficient).toBe(s.comparableAnalysis[1].qualityCoefficient)
    expect(r!.ai.comparables[0].features.quality).toBe('EXCELLENT')
    expect(r!.ai.comparables[0].reasoning).toBe('r1')
    expect(r!.ai.inputFingerprint).toBe('huella')
    expect(r!.publicationPrice).not.toBe(s.publicationPrice)
  })
  it('cambiar el subject usa las features nuevas y las guarda en el snapshot', () => {
    const s = snapshotBase()
    const r = recalcularSnapshotIA(s, subject, filas, { tipo: 'subject', features: { ...subject.features, quality: 'EXCELLENT' } })
    expect(r!.subjectQualityCoef).toBe(1.275)
    expect(r!.ai.subject.features.quality).toBe('EXCELLENT')
  })
  it('cambiar los gastos mantiene el precio de publicación y cambia el dinero en mano', () => {
    const s = snapshotBase()
    const r = recalcularSnapshotIA(s, subject, filas, { tipo: 'gastos', expenseRates: { agencyFeesPercent: 4 } })
    expect(r!.publicationPrice).toBe(s.publicationPrice)
    expect(r!.expenseRates.agencyFeesPercent).toBe(4)
    expect(r!.expenseRates.saleDiscountPercent).toBe(5)
    expect(r!.moneyInHand).toBeLessThan(s.moneyInHand)
  })
  it('conserva la parte del propietario y la recalcula sobre el nuevo dinero en mano', () => {
    const s = snapshotBase()
    const r = recalcularSnapshotIA(s, subject, filas, { tipo: 'gastos', expenseRates: { agencyFeesPercent: 4 } })
    expect(r!.ownerSharePercent).toBe(50)
    expect(r!.ownerShareMoney).toBe(Math.round(r!.moneyInHand * 0.5))
  })
  it('devuelve null si la calculadora no puede (superficie 0)', () => {
    expect(recalcularSnapshotIA(snapshotBase(), subject, filas, { tipo: 'subject', features: { coveredArea: 0 } })).toBeNull()
  })
  it('un índice fuera de rango devuelve null', () => {
    expect(recalcularSnapshotIA(snapshotBase(), subject, filas, { tipo: 'comparable', index: 7, features: {} })).toBeNull()
  })
})
