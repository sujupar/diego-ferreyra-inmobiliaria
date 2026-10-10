import { describe, it, expect } from 'vitest'
import { calculateAgeStateCoefficient, textoCoeficienteEstado } from './rules'

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
