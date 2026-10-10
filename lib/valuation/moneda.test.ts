import { describe, it, expect } from 'vitest'
import { requiereConversion, comparablesEnOtraMoneda } from './moneda'

describe('requiereConversion', () => {
    it('un aviso en pesos requiere convertir a USD antes de promediar', () => {
        expect(requiereConversion('ARS')).toBe(true)
    })

    it('USD no requiere conversión, sin importar mayúsculas', () => {
        expect(requiereConversion('USD')).toBe(false)
        expect(requiereConversion('usd')).toBe(false)
    })

    it('sin moneda (filas viejas) se toma como USD: no se bloquea lo ya cargado', () => {
        expect(requiereConversion(null)).toBe(false)
        expect(requiereConversion(undefined)).toBe(false)
        expect(requiereConversion('')).toBe(false)
    })

    it('cualquier otra moneda conocida también requiere conversión', () => {
        expect(requiereConversion('EUR')).toBe(true)
    })
})

describe('comparablesEnOtraMoneda', () => {
    it('lista los índices de los comparables que no están en USD', () => {
        expect(comparablesEnOtraMoneda([{ currency: 'USD' }, { currency: 'ARS' }, { currency: null }, { currency: 'ARS' }])).toEqual([1, 3])
    })
})
