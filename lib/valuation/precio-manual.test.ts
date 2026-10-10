import { describe, it, expect } from 'vitest'
import { valuacionConPreciosManuales, validarZonaDeNoVenta } from './precio-manual'
import { calculateValuation, type ValuationProperty } from './calculator'
import { completarValuacion } from './completar-valuacion'
import { buildDefaultScenarios } from './purchase-scenarios'

const features: ValuationProperty['features'] = {
    coveredArea: 50, floor: 3, age: 10, disposition: 'FRONT', quality: 'GOOD_ECONOMIC', conservationState: 'STATE_2',
}

function resultado() {
    const base = calculateValuation({
        subject: { features },
        comparables: [100_000, 110_000, 120_000].map(price => ({ price, currency: 'USD', features })),
    })
    if (!base) throw new Error('fixture inválido')
    return completarValuacion(base, {
        ownerSharePercent: 50,
        purchaseScenarios: buildDefaultScenarios(90_000, 'prop_0', 'Compra'),
        selectedScenarioIds: ['prop_0:conservative'],
    })
}

describe('valuacionConPreciosManuales', () => {
    it('sin precios a mano devuelve el mismo resultado', () => {
        const r = resultado()
        expect(valuacionConPreciosManuales(r, undefined)).toBe(r)
        expect(valuacionConPreciosManuales(r, {})).toBe(r)
    })

    it('la venta, la escritura y los gastos salen del precio de publicación cargado a mano', () => {
        const r = valuacionConPreciosManuales(resultado(), { publicationPrice: 200_000 })
        expect(r.publicationPrice).toBe(200_000)
        expect(r.saleValue).toBe(190_000)        // 5 % menos
        expect(r.deedValue).toBe(133_000)        // 30 % menos que la venta
        expect(r.stampsCost).toBe(1_796)         // 1,35 % de la escritura
        expect(r.deedExpenses).toBe(2_850)       // 1,5 % de la venta
        expect(r.agencyFees).toBe(5_700)         // 3 % de la venta
        expect(r.totalExpenses).toBe(10_346)
        expect(r.moneyInHand).toBe(179_654)
    })

    it('da exactamente lo mismo que el cálculo cuando el precio a mano es el calculado', () => {
        const original = resultado()
        const r = valuacionConPreciosManuales(original, { publicationPrice: original.publicationPrice })
        expect(r.moneyInHand).toBe(original.moneyInHand)
        expect(r.totalExpenses).toBe(original.totalExpenses)
    })

    it('la Zona de No Venta calculada acompaña al precio a mano (publicación × 1,05)', () => {
        const r = valuacionConPreciosManuales(resultado(), { publicationPrice: 200_000 })
        expect(r.noSaleZonePrice).toBe(210_000)
    })

    it('un precio de venta a mano se respeta y los gastos salen de él', () => {
        const r = valuacionConPreciosManuales(resultado(), { publicationPrice: 200_000, saleValue: 180_000 })
        expect(r.saleValue).toBe(180_000)
        expect(r.agencyFees).toBe(5_400)
    })

    it('la parte del propietario y los escenarios de compra usan el dinero en mano nuevo', () => {
        const r = valuacionConPreciosManuales(resultado(), { publicationPrice: 200_000 })
        expect(r.ownerShareMoney).toBe(Math.round(179_654 * 0.5))
        expect(r.purchaseScenarios?.[0].moneyFromSale).toBe(r.ownerShareMoney)
        expect(r.selectedScenarioIds).toEqual(['prop_0:conservative'])
    })

    it('usa las tasas guardadas de la tasación, no las de fábrica', () => {
        const original = resultado()
        const conTasas = { ...original, expenseRates: { ...original.expenseRates, agencyFeesPercent: 4 } }
        const r = valuacionConPreciosManuales(conTasas, { publicationPrice: 200_000 })
        expect(r.agencyFees).toBe(7_600)
    })

    it('ignora un precio a mano que no es un número positivo', () => {
        const r = resultado()
        expect(valuacionConPreciosManuales(r, { publicationPrice: 0 })).toBe(r)
        expect(valuacionConPreciosManuales(r, { publicationPrice: Number.NaN })).toBe(r)
    })

    it('no toca el análisis de comparables (solo la cadena de precios)', () => {
        const original = resultado()
        const r = valuacionConPreciosManuales(original, { publicationPrice: 200_000 })
        expect(r.comparableAnalysis).toBe(original.comparableAnalysis)
        expect(r.averagePriceM2).toBe(original.averagePriceM2)
    })
})

describe('validarZonaDeNoVenta', () => {
    it('vacía no es un error (se usa la calculada)', () => {
        expect(validarZonaDeNoVenta(undefined, 200_000)).toBeNull()
    })

    it('igual o mayor a la publicación es válida', () => {
        expect(validarZonaDeNoVenta(200_000, 200_000)).toBeNull()
        expect(validarZonaDeNoVenta(215_000, 200_000)).toBeNull()
    })

    it('por debajo de la publicación es un error que dice el piso', () => {
        expect(validarZonaDeNoVenta(190_000, 200_000)).toMatch(/no puede ser menor/i)
        expect(validarZonaDeNoVenta(190_000, 200_000)).toContain('200.000')
    })

    it('un valor que no es un número positivo es un error', () => {
        expect(validarZonaDeNoVenta(0, 200_000)).not.toBeNull()
        expect(validarZonaDeNoVenta(Number.NaN, 200_000)).not.toBeNull()
    })
})
