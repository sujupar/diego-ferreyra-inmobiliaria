import { describe, it, expect } from 'vitest'
import { mergeJsonb, pickPendingSlugs, allNull } from './ingest'

describe('mergeJsonb', () => {
    it('el patch pisa solo sus claves; null/undefined del patch NO borra lo existente', () => {
        const existing = { stock: { a: 1 }, escrituras: { b: 2 } }
        expect(mergeJsonb(existing, { stock: { a: 9 } })).toEqual({ stock: { a: 9 }, escrituras: { b: 2 } })
        expect(mergeJsonb(existing, { escrituras: null })).toEqual(existing)
        expect(mergeJsonb(null, { stock: { a: 1 } })).toEqual({ stock: { a: 1 } })
    })

    it('merge campo por campo dentro de un sub-objeto: un fallback degradado (nulls puntuales) no pisa los campos buenos ya capturados — clave para price por barrio, donde el fallback del mapa trae usado/pozo/estrenar/alq2amb en null', () => {
        expect(mergeJsonb({ prom: 3403, usado: 3051 }, { prom: 3500, usado: null })).toEqual({ prom: 3500, usado: 3051 })
    })
})

describe('allNull', () => {
    it('true cuando el objeto es null/undefined/vacío o TODOS sus valores son null/undefined', () => {
        expect(allNull({ a: null, b: undefined })).toBe(true)
        expect(allNull({})).toBe(true)
        expect(allNull(null)).toBe(true)
        expect(allNull(undefined)).toBe(true)
    })

    it('false cuando al menos un valor no es null/undefined (0 y "" cuentan como presentes)', () => {
        expect(allNull({ a: 0 })).toBe(false)
        expect(allNull({ a: null, b: 5 })).toBe(false)
        expect(allNull({ a: '' })).toBe(false)
    })
})

describe('pickPendingSlugs', () => {
    it('devuelve los que faltan, respetando el límite', () => {
        expect(pickPendingSlugs(new Set(['a', 'b']), ['a', 'b', 'c', 'd', 'e'], 2)).toEqual(['c', 'd'])
        expect(pickPendingSlugs(new Set(), ['a'], 10)).toEqual(['a'])
        expect(pickPendingSlugs(new Set(['a']), ['a'], 10)).toEqual([])
    })
})
