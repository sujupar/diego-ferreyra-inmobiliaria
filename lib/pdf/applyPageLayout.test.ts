import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
    resolveSavedLayout,
    layoutChangesAnything,
    buildPdfWithLayout,
    getPdfPageCount,
} from './applyPageLayout'

describe('resolveSavedLayout', () => {
    it('devuelve null si la cantidad de páginas no coincide (estructura distinta)', () => {
        expect(resolveSavedLayout({ order: [0, 1, 2], hidden: [], pageCount: 3 }, 4)).toBeNull()
    })
    it('aplica el orden excluyendo las ocultas cuando pageCount coincide', () => {
        expect(resolveSavedLayout({ order: [2, 0, 1], hidden: [0], pageCount: 3 }, 3)).toEqual([2, 1])
    })
    it('completa índices faltantes en orden natural', () => {
        expect(resolveSavedLayout({ order: [2], hidden: [], pageCount: 3 }, 3)).toEqual([2, 0, 1])
    })
    it('ignora índices fuera de rango', () => {
        expect(resolveSavedLayout({ order: [5, 1, 0], hidden: [9], pageCount: 3 }, 3)).toEqual([1, 0, 2])
    })
})

describe('layoutChangesAnything', () => {
    it('false para el orden identidad sin ocultas', () => {
        expect(layoutChangesAnything([0, 1, 2], [])).toBe(false)
    })
    it('true si hay páginas ocultas', () => {
        expect(layoutChangesAnything([0, 1, 2], [1])).toBe(true)
    })
    it('true si está reordenado', () => {
        expect(layoutChangesAnything([1, 0, 2], [])).toBe(true)
    })
})

describe('buildPdfWithLayout', () => {
    async function makePdf(n: number): Promise<Uint8Array> {
        const doc = await PDFDocument.create()
        for (let i = 0; i < n; i++) doc.addPage([200, 200])
        return await doc.save()
    }

    it('reordena y borra páginas según visibleOrder', async () => {
        const src = await makePdf(4)
        const out = await buildPdfWithLayout(src, [3, 1]) // conserva solo páginas 3 y 1, en ese orden
        expect(await getPdfPageCount(out)).toBe(2)
    })

    it('devuelve el PDF original intacto si visibleOrder queda vacío', async () => {
        const src = await makePdf(3)
        const out = await buildPdfWithLayout(src, [])
        expect(await getPdfPageCount(out)).toBe(3)
    })

    it('ignora índices inválidos sin romper', async () => {
        const src = await makePdf(2)
        const out = await buildPdfWithLayout(src, [0, 99, 1])
        expect(await getPdfPageCount(out)).toBe(2)
    })
})
