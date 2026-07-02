import { describe, it, expect } from 'vitest'
import { mergeJsonb, pickPendingSlugs } from './ingest'

describe('mergeJsonb', () => {
    it('el patch pisa solo sus claves; null/undefined del patch NO borra lo existente', () => {
        const existing = { stock: { a: 1 }, escrituras: { b: 2 } }
        expect(mergeJsonb(existing, { stock: { a: 9 } })).toEqual({ stock: { a: 9 }, escrituras: { b: 2 } })
        expect(mergeJsonb(existing, { escrituras: null })).toEqual(existing)
        expect(mergeJsonb(null, { stock: { a: 1 } })).toEqual({ stock: { a: 1 } })
    })
})

describe('pickPendingSlugs', () => {
    it('devuelve los que faltan, respetando el límite', () => {
        expect(pickPendingSlugs(new Set(['a', 'b']), ['a', 'b', 'c', 'd', 'e'], 2)).toEqual(['c', 'd'])
        expect(pickPendingSlugs(new Set(), ['a'], 10)).toEqual(['a'])
        expect(pickPendingSlugs(new Set(['a']), ['a'], 10)).toEqual([])
    })
})
