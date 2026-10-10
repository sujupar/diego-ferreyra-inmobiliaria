import { describe, it, expect } from 'vitest'
import { precioDeCompraValido } from './precio-compra'

describe('precioDeCompraValido', () => {
    it('sin precio no hay precio de compra (antes se inventaban USD 100.000)', () => {
        expect(precioDeCompraValido(null)).toBeNull()
        expect(precioDeCompraValido(undefined)).toBeNull()
    })

    it('cero o negativo no es un precio', () => {
        expect(precioDeCompraValido(0)).toBeNull()
        expect(precioDeCompraValido(-5)).toBeNull()
    })

    it('un número no finito no es un precio', () => {
        expect(precioDeCompraValido(Number.NaN)).toBeNull()
        expect(precioDeCompraValido(Number.POSITIVE_INFINITY)).toBeNull()
    })

    it('un precio positivo se usa tal cual', () => {
        expect(precioDeCompraValido(185_000)).toBe(185_000)
    })
})
