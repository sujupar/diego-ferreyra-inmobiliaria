import { describe, it, expect } from 'vitest'
import { variacionMensualTotal, stockDestacado } from './stock-destacado'
import type { StockComposition } from './types'

const base: StockComposition = {
    stockDeptos: 74584, stockVm: -0.008, absorcion: 18.2, totalInmuebles: 110214,
    tipos: [], antiguedad: [], vendedor: [], antPublicacion: [],
}

describe('variacionMensualTotal', () => {
    it('calcula la caída de octubre 2026 contra septiembre (110.214 vs 110.907)', () => {
        const v = variacionMensualTotal(110214, 110907)
        expect(v).not.toBeNull()
        expect(v).toBeCloseTo(-0.006249, 5)
    })
    it('calcula una suba como número positivo', () => {
        expect(variacionMensualTotal(110000, 100000)).toBeCloseTo(0.1, 10)
    })
    it('devuelve null si no hay total anterior', () => {
        expect(variacionMensualTotal(110214, null)).toBeNull()
    })
    it('devuelve null si no hay total actual', () => {
        expect(variacionMensualTotal(null, 110907)).toBeNull()
    })
    it('devuelve null si el total es idéntico al anterior (la fuente no se actualizó)', () => {
        expect(variacionMensualTotal(110907, 110907)).toBeNull()
    })
    it('devuelve null si el total anterior es cero (evita dividir por cero)', () => {
        expect(variacionMensualTotal(110214, 0)).toBeNull()
    })
})

describe('stockDestacado', () => {
    it('destaca el total de inmuebles con su variación mensual', () => {
        const d = stockDestacado(base, 110907)
        expect(d.valor).toBe(110214)
        expect(d.rotulo).toBe('inmuebles en venta')
        expect(d.variacion).toBeCloseTo(-0.006249, 5)
    })
    it('no muestra variación del total si no hay período anterior', () => {
        const d = stockDestacado(base, null)
        expect(d.rotulo).toBe('inmuebles en venta')
        expect(d.variacion).toBeNull()
    })
    it('no usa la variación de departamentos para el total aunque exista', () => {
        expect(stockDestacado(base, 110214).variacion).toBeNull()
    })
    it('sin total, cae a departamentos con su rótulo y su variación', () => {
        const d = stockDestacado({ ...base, totalInmuebles: null }, 110907)
        expect(d.valor).toBe(74584)
        expect(d.rotulo).toBe('deptos en venta')
        expect(d.variacion).toBe(-0.008)
    })
    it('con total en cero, cae a departamentos', () => {
        expect(stockDestacado({ ...base, totalInmuebles: 0 }, 110907).rotulo).toBe('deptos en venta')
    })
    it('sin total, una variación de departamentos idéntica a cero no se muestra', () => {
        expect(stockDestacado({ ...base, totalInmuebles: null, stockVm: 0 }, null).variacion).toBeNull()
    })
})
