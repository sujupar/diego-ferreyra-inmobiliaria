import { describe, it, expect } from 'vitest'
import * as calculadora from './calculator'
import { calculateHomogenizedSurface, calculateWeightedPricePerM2 } from './calculator'

describe('superficie homologada — una sola fórmula (C5)', () => {
    it('cubierta 100 %, semicubierta y descubierta al 50 %', () => {
        expect(calculateHomogenizedSurface({ coveredArea: 48, semiCoveredArea: 4, uncoveredArea: 12 })).toBe(56)
    })

    it('acepta campos vacíos (null) como los guardan los portales', () => {
        expect(calculateHomogenizedSurface({ coveredArea: 48, semiCoveredArea: null, uncoveredArea: null })).toBe(48)
    })

    it('el $/m² ponderado divide por la MISMA superficie homologada', () => {
        const f = { coveredArea: 48, semiCoveredArea: 4, uncoveredArea: 12 }
        expect(calculateWeightedPricePerM2(112_000, f)).toBe(112_000 / calculateHomogenizedSurface(f))
    })

    it('sin precio o sin superficie no hay $/m²', () => {
        expect(calculateWeightedPricePerM2(null, { coveredArea: 48 })).toBeNull()
        expect(calculateWeightedPricePerM2(100_000, { coveredArea: 0 })).toBeNull()
    })
})

describe('escenarios de compra — una sola implementación (C5)', () => {
    it('calculatePurchaseCosts ya no existe: el cálculo vive en purchase-scenarios', () => {
        expect('calculatePurchaseCosts' in calculadora).toBe(false)
    })
})
