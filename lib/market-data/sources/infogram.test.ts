// lib/market-data/sources/infogram.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseHydratedInfogram, fetchInfogramComposition, INFOGRAM_EMBED_URL } from './infogram'

const FIX = join(__dirname, '../__fixtures__')
const renderedHtml = readFileSync(join(FIX, 'infogram-rendered.html'), 'utf8')

describe('parseHydratedInfogram (fixture real, render+wait de ScraperAPI 2026-07-02)', () => {
    it('clasifica las 4 series por contenido, no por orden de aparición', () => {
        const c = parseHydratedInfogram(renderedHtml)
        expect(c.tipos.length).toBeGreaterThanOrEqual(9)
        expect(c.antiguedad.length).toBeGreaterThan(0)
        expect(c.vendedor.length).toBeGreaterThan(0)
        expect(c.antPublicacion.length).toBeGreaterThan(0)
    })

    it('tipos: ≥9 filas, Departamentos > 50% y con count', () => {
        const c = parseHydratedInfogram(renderedHtml)
        expect(c.tipos.length).toBeGreaterThanOrEqual(9)
        const deptos = c.tipos.find(t => /departamento/i.test(t.label))!
        expect(deptos).toBeTruthy()
        expect(deptos.pct).toBeGreaterThan(50)
        expect(deptos.count).toBeGreaterThan(0)
        for (const t of c.tipos) {
            expect(typeof t.count === 'number' && t.count! > 0).toBe(true)
        }
    })

    it('cada serie suma 95-105%', () => {
        const c = parseHydratedInfogram(renderedHtml)
        const sum = (arr: { pct: number }[]) => arr.reduce((a, x) => a + x.pct, 0)
        expect(sum(c.tipos)).toBeGreaterThanOrEqual(95)
        expect(sum(c.tipos)).toBeLessThanOrEqual(105)
        expect(sum(c.antiguedad)).toBeGreaterThanOrEqual(95)
        expect(sum(c.antiguedad)).toBeLessThanOrEqual(105)
        expect(sum(c.vendedor)).toBeGreaterThanOrEqual(95)
        expect(sum(c.vendedor)).toBeLessThanOrEqual(105)
        expect(sum(c.antPublicacion)).toBeGreaterThanOrEqual(95)
        expect(sum(c.antPublicacion)).toBeLessThanOrEqual(105)
    })

    it('vendedor contiene Inmobiliaria y Dueño directo', () => {
        const c = parseHydratedInfogram(renderedHtml)
        expect(c.vendedor.some(v => /inmobiliaria/i.test(v.label))).toBe(true)
        expect(c.vendedor.some(v => /due[ñn]o/i.test(v.label))).toBe(true)
    })

    it('antPublicacion contiene los dos rangos de días', () => {
        const c = parseHydratedInfogram(renderedHtml)
        expect(c.antPublicacion.some(v => /45 d[ií]as/i.test(v.label))).toBe(true)
    })

    it('totalInmuebles > 100.000', () => {
        const c = parseHydratedInfogram(renderedHtml)
        expect(c.totalInmuebles).toBeGreaterThan(100_000)
    })

    it('FALLA RUIDOSO ante HTML vacío/sin datos', () => {
        expect(() => parseHydratedInfogram('<html></html>')).toThrow(/infogram/i)
    })
})

describe('fetchInfogramComposition sin SCRAPER_API_KEY', () => {
    const original = process.env.SCRAPER_API_KEY
    beforeEach(() => { delete process.env.SCRAPER_API_KEY })
    afterEach(() => { if (original !== undefined) process.env.SCRAPER_API_KEY = original })

    it('devuelve ok:false explicando la causa (nunca fabrica datos)', async () => {
        const r = await fetchInfogramComposition()
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toMatch(/SCRAPER_API_KEY/)
    })
})

describe('INFOGRAM_EMBED_URL', () => {
    it('exporta la URL del embed', () => {
        expect(INFOGRAM_EMBED_URL).toContain('e.infogram.com')
    })
})
