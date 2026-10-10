import { describe, it, expect } from 'vitest'
import { recalcularFicha, type EstadoFicha, type FilaFicha } from './recalculo-ficha'
import { calculateValuation, type ValuationProperty } from './calculator'
import { completarValuacion } from './completar-valuacion'
import { buildDefaultScenarios } from './purchase-scenarios'

const features = (o: Partial<ValuationProperty['features']> = {}): ValuationProperty['features'] => ({
    coveredArea: 50, uncoveredArea: 0, floor: 3, age: 10,
    disposition: 'FRONT', quality: 'GOOD_ECONOMIC', conservationState: 'STATE_2', ...o,
})

const fila = (sort: number, price: number, tipo?: string): FilaFicha => ({
    title: `Comp ${sort}`, location: 'CABA', price, currency: 'USD',
    features: features(), analysis: tipo ? { propertyType: tipo } : null, sort_order: sort,
})

function estadoInicial(): EstadoFicha<FilaFicha> {
    const sujeto: ValuationProperty = { title: 'Sujeto', location: 'CABA', price: null, currency: 'USD', features: features() }
    const filas = [fila(0, 100_000), fila(1, 110_000), fila(2, 120_000), fila(3, 90_000, 'purchase')]
    const base = calculateValuation({
        subject: sujeto,
        comparables: filas.slice(0, 3).map(f => ({ price: f.price, currency: f.currency, features: f.features })),
    })
    if (!base) throw new Error('fixture inválido')
    const escenarios = buildDefaultScenarios(90_000, 'prop_0', 'Compra')
    const resultado = completarValuacion(base, {
        ownerSharePercent: 50,
        purchaseScenarios: escenarios,
        selectedScenarioIds: ['prop_0:conservative'],
    })
    return { sujeto, filas, resultado }
}

describe('recalcularFicha', () => {
    it('editar el comparable 1 y después el 2 conserva las dos ediciones', () => {
        const e1 = recalcularFicha(estadoInicial(), { tipo: 'comparable', indice: 0, features: features({ floor: 8 }) })
        if (!e1) throw new Error('debía calcular')
        const e2 = recalcularFicha(e1, { tipo: 'comparable', indice: 1, features: features({ floor: 1 }) })
        if (!e2) throw new Error('debía calcular')
        expect(e2.filas[0].features.floor).toBe(8)
        expect(e2.filas[1].features.floor).toBe(1)
        expect(e2.resultado.comparableAnalysis[0].floorCoefficient).toBe(1.1)
        expect(e2.resultado.comparableAnalysis[1].floorCoefficient).toBe(0.85)
    })

    it('no toca las propiedades de compra ni las fuera de precio', () => {
        const e = recalcularFicha(estadoInicial(), { tipo: 'comparable', indice: 0, features: features({ floor: 8 }) })
        expect(e?.filas[3]).toEqual(estadoInicial().filas[3])
    })

    it('conserva la parte del propietario y la recalcula con el nuevo dinero en mano', () => {
        const e = recalcularFicha(estadoInicial(), { tipo: 'sujeto', features: features({ coveredArea: 80 }) })
        if (!e) throw new Error('debía calcular')
        expect(e.resultado.ownerSharePercent).toBe(50)
        expect(e.resultado.ownerShareMoney).toBe(Math.round(e.resultado.moneyInHand * 0.5))
        expect(e.sujeto.features.coveredArea).toBe(80)
    })

    it('los escenarios de compra se recalculan con el dinero nuevo, no el viejo', () => {
        const antes = estadoInicial()
        const e = recalcularFicha(antes, { tipo: 'sujeto', features: features({ coveredArea: 80 }) })
        if (!e) throw new Error('debía calcular')
        const escenario = e.resultado.purchaseScenarios?.[0]
        expect(escenario?.moneyFromSale).toBe(e.resultado.ownerShareMoney)
        expect(escenario?.moneyFromSale).not.toBe(antes.resultado.purchaseScenarios?.[0].moneyFromSale)
        expect(e.resultado.selectedScenarioIds).toEqual(['prop_0:conservative'])
    })

    it('cambiar una tasa conserva las otras y la usa en la cadena de gastos', () => {
        const e = recalcularFicha(estadoInicial(), { tipo: 'tasas', tasas: { agencyFeesPercent: 4 } })
        if (!e) throw new Error('debía calcular')
        expect(e.resultado.expenseRates.agencyFeesPercent).toBe(4)
        expect(e.resultado.expenseRates.stampsPercent).toBe(1.35)
        expect(e.resultado.agencyFees).toBe(Math.round(e.resultado.saleValue * 0.04))
    })

    it('el índice del informe salta los comparables que no entran al cálculo (sin precio)', () => {
        const inicial = estadoInicial()
        const conHueco: EstadoFicha<FilaFicha> = {
            ...inicial,
            filas: [fila(0, 0), ...inicial.filas.slice(1)],
        }
        // En el informe, el índice 0 es la fila con sort 1 (la de sort 0 no tiene precio).
        const e = recalcularFicha(conHueco, { tipo: 'comparable', indice: 0, features: features({ floor: 8 }) })
        expect(e?.filas[0].features.floor).toBe(3)
        expect(e?.filas[1].features.floor).toBe(8)
    })

    it('si el cálculo no es posible devuelve null y no inventa un resultado', () => {
        const e = recalcularFicha(estadoInicial(), { tipo: 'sujeto', features: features({ coveredArea: 0 }) })
        expect(e).toBeNull()
    })
})
