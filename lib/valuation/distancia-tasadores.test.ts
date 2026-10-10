import { describe, it, expect } from 'vitest'
import { distanciaEntreTasadores, explicarDistancia, UMBRAL_DISTANCIA, resumenCorrecciones } from './distancia-tasadores'
import type { ValuationResult } from './calculator'

const base = {
    subjectLocationCoef: 1, subjectFloorCoef: 1, subjectDispositionCoef: 1, subjectQualityCoef: 1.075,
    subjectAgeCoef: 0.84, subjectTotalCoef: 0.903, averagePriceM2: 2000, publicationPrice: 130000, currency: 'USD',
} as unknown as ValuationResult

describe('distanciaEntreTasadores', () => {
    it('el umbral aprobado es 15 %', () => {
        expect(UMBRAL_DISTANCIA).toBe(0.15)
    })
    it('calcula la diferencia relativa al clásico', () => {
        const d = distanciaEntreTasadores({ publicationPrice: 130000 }, { publicationPrice: 149500 })
        expect(d.porcentaje).toBeCloseTo(15, 6)
        expect(d.excede).toBe(false)
    })
    it('marca cuando el IA se aleja más del 15 %, para arriba o para abajo', () => {
        expect(distanciaEntreTasadores({ publicationPrice: 130000 }, { publicationPrice: 240000 }).excede).toBe(true)
        expect(distanciaEntreTasadores({ publicationPrice: 130000 }, { publicationPrice: 100000 }).excede).toBe(true)
    })
})

describe('explicarDistancia — de dónde sale la diferencia', () => {
    it('nombra cada coeficiente del sujeto que cambió, con antes y después', () => {
        const ia = { ...base, subjectLocationCoef: 1.1, subjectFloorCoef: 0.9 } as ValuationResult
        const lineas = explicarDistancia(base, ia)
        expect(lineas).toContain('Ubicación de la propiedad: 1,00 → 1,10')
        expect(lineas).toContain('Piso de la propiedad: 1,00 → 0,90')
    })
    it('muestra el cambio en el promedio ajustado de los comparables', () => {
        const ia = { ...base, averagePriceM2: 2300 } as ValuationResult
        expect(explicarDistancia(base, ia)).toContain('Promedio por m² ajustado de los comparables: USD 2.000 → USD 2.300 (+15,0 %)')
    })
    it('no lista lo que no cambió', () => {
        expect(explicarDistancia(base, { ...base })).toEqual([])
    })
})

describe('resumenCorrecciones', () => {
    it('cuenta las cuentas del modelo que corrigió el método, por propiedad', () => {
        const r = resumenCorrecciones({
            subject: { features: {}, reasoning: '', correcciones: [{ coeficiente: 'kTabla', ia: 10.3, metodo: 8.009 }] },
            comparables: [
                { features: {}, reasoning: '', correcciones: [] },
                { features: {}, reasoning: '', correcciones: [{ coeficiente: 'kPiso', ia: 1.1, metodo: 1.15 }, { coeficiente: 'nTotal', ia: 0.9, metodo: 0.95 }] },
            ],
        })
        expect(r.total).toBe(3)
        expect(r.lineas).toEqual([
            'Propiedad tasada — tabla Ross-Heidecke: 10,3 → 8,009',
            'Comparable 2 — piso: 1,1 → 1,15',
            'Comparable 2 — coeficiente total: 0,9 → 0,95',
        ])
    })
    it('un snapshot viejo sin planilla no tiene correcciones', () => {
        expect(resumenCorrecciones({ subject: { features: {}, reasoning: '' }, comparables: [] }).total).toBe(0)
    })
})
