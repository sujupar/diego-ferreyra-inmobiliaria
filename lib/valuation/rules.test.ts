import { describe, it, expect } from 'vitest'
import { ROSS_HEIDECKE_TABLE, calculateAgeStateCoefficient, textoCoeficienteEstado } from './rules'

describe('textoCoeficienteEstado — lo que se ve es lo que se aplica (C1)', () => {
    it('Estado 3 a estrenar muestra ×0,91 (W = 1 − 18,1/200), no "18,1 %"', () => {
        expect(textoCoeficienteEstado('STATE_3', 0)).toBe('×0,91')
    })

    it('usa la antigüedad cargada: es el mismo W que aplica el cálculo', () => {
        const w = calculateAgeStateCoefficient(35, 'STATE_3')
        expect(textoCoeficienteEstado('STATE_3', 35)).toBe(`×${w.toFixed(2).replace('.', ',')}`)
    })

    it('sin antigüedad muestra el de 0 años', () => {
        expect(textoCoeficienteEstado('STATE_2', null)).toBe(textoCoeficienteEstado('STATE_2', 0))
        expect(textoCoeficienteEstado('STATE_2', undefined)).toBe('×0,99')
    })

    it('Estado 5 (demolición) se ve como ×0,50, que es lo que se aplica', () => {
        expect(textoCoeficienteEstado('STATE_5', 0)).toBe('×0,50')
    })
})

/**
 * C3 (auditoría 2026-10-03): la tabla tenía 5 valores mal tipeados respecto de
 * su propia fórmula. K(p,s) = D + Ds − D·Ds/100, con D = 50·(p/100 + (p/100)²)
 * (fila de Estado 1) y Ds = fila 0 de cada estado.
 */
describe('Tabla Ross-Heidecke', () => {
    const fila0 = ROSS_HEIDECKE_TABLE[0]
    const formula = (p: number, s: number) => {
        const d = 50 * (p / 100 + (p / 100) ** 2)
        return d + fila0[s] - (d * fila0[s]) / 100
    }

    it('tiene 100 filas de 9 estados', () => {
        for (let p = 0; p < 100; p++) expect(ROSS_HEIDECKE_TABLE[p]).toHaveLength(9)
    })

    it('la columna del Estado 1 coincide con D = 50·(p/100 + (p/100)²) (±0,02)', () => {
        for (let p = 0; p < 100; p++) {
            expect(Math.abs(ROSS_HEIDECKE_TABLE[p][0] - formula(p, 0)), `fila ${p}`).toBeLessThanOrEqual(0.02)
        }
    })

    it('cada valor coincide con su fórmula (±0,1)', () => {
        for (let p = 0; p < 100; p++) {
            for (let s = 1; s < 9; s++) {
                expect(Math.abs(ROSS_HEIDECKE_TABLE[p][s] - formula(p, s)), `fila ${p}, estado ${s}`).toBeLessThanOrEqual(0.1)
            }
        }
    })

    it('cada columna crece con la edad (nunca deprecia menos un edificio más viejo)', () => {
        for (let s = 0; s < 9; s++) {
            for (let p = 1; p < 100; p++) {
                expect(ROSS_HEIDECKE_TABLE[p][s], `fila ${p}, estado ${s}`).toBeGreaterThanOrEqual(ROSS_HEIDECKE_TABLE[p - 1][s])
            }
        }
    })
})
