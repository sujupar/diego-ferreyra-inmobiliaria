import { describe, it, expect } from 'vitest'
import { explicarCalculo } from './explicar-calculo'
import { calculateValuation, type ValuationProperty } from '../valuation/calculator'

const sujeto: ValuationProperty = {
    title: 'Paraguay 3682', features: { coveredArea: 72, uncoveredArea: 6, floor: 4, age: 0, conservationState: 'STATE_1', quality: 'GOOD_ECONOMIC', disposition: 'FRONT' },
}
const comparables: ValuationProperty[] = [
    { title: 'Thames 2100', price: 200_000, currency: 'USD', features: { coveredArea: 80, floor: 4, age: 0, conservationState: 'STATE_1' } },
    { title: 'Gurruchaga 1800', price: 180_000, currency: 'USD', features: { coveredArea: 75, floor: 1, age: 0, conservationState: 'STATE_1' } },
]
const resultado = calculateValuation({ subject: sujeto, comparables })!

describe('explicarCalculo — el cálculo paso a paso con los números exactos', () => {
    const e = explicarCalculo(resultado)

    it('arranca por la superficie que cuenta, con cubierta y descubierta', () => {
        expect(e.pasos[0].titulo).toBe('Superficie que cuenta')
        expect(e.pasos[0].texto).toContain('75 m²')
    })

    it('tiene una fila por comparable con precio, m², $/m², coeficiente total y $/m² ajustado', () => {
        expect(e.tablaComparables.columnas).toEqual(['Comparable', 'Precio', 'M² homologados', 'USD/m²', 'Coeficiente total', 'USD/m² ajustado'])
        expect(e.tablaComparables.filas).toHaveLength(2)
        expect(e.tablaComparables.filas[0][0]).toBe('Thames 2100')
        expect(e.tablaComparables.filas[0][1]).toBe('USD 200.000')
        expect(e.tablaComparables.filas[1][4]).toBe('0,85') // 1er piso
    })

    it('muestra el promedio ajustado y el coeficiente de la propiedad tasada', () => {
        const textos = e.pasos.map(p => p.texto).join(' ')
        expect(textos).toContain(`USD ${Math.round(resultado.averagePriceM2).toLocaleString('es-AR')}`)
        expect(textos).toContain(resultado.subjectTotalCoef.toLocaleString('es-AR', { maximumFractionDigits: 3 }))
    })

    it('termina en el precio de publicación redondeado y la Zona de No Venta', () => {
        const ultimo = e.pasos.at(-1)!
        expect(ultimo.texto).toContain(`USD ${resultado.publicationPrice.toLocaleString('es-AR')}`)
        expect(ultimo.texto).toContain(`USD ${resultado.noSaleZonePrice.toLocaleString('es-AR')}`)
    })

    it('cada número que menciona sale del resultado: el valor por m² × superficie da el valor final', () => {
        expect(resultado.subjectSurface * resultado.subjectPriceM2).toBeCloseTo(resultado.finalValue, 6)
        expect(e.pasos.some(p => p.texto.includes(`USD ${Math.round(resultado.finalValue).toLocaleString('es-AR')}`))).toBe(true)
    })

    it('explica qué tiene cada comparable de distinto en coeficientes legibles', () => {
        expect(e.coeficientesPorComparable[1]).toContain('piso 0,85')
    })
})
