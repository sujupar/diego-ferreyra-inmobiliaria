// lib/market-data/sources/colegio.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseColegioFeed } from './colegio'

const xml = readFileSync(join(__dirname, '../__fixtures__/colegio-feed.xml'), 'utf8')

describe('parseColegioFeed', () => {
    it('toma el item más reciente con título, link y la primera imagen', () => {
        const p = parseColegioFeed(xml)
        expect(p.mesLabel).toMatch(/de 20\d\d|[A-Z][a-z]+ 20\d\d/)     // "Mayo 2026"
        expect(p.articleUrl).toMatch(/^https:\/\/www\.colegio-escribanos\.org\.ar\//)
        expect(p.imageSourceUrl).toMatch(/wp-content\/uploads.*\.(jpg|jpeg|png)/i)
    })
    it('extrae las cifras clave del cuerpo (valores reales del fixture Mayo 2026)', () => {
        const p = parseColegioFeed(xml)
        expect(p.mesLabel).toBe('Mayo 2026')
        // "Actos de escrituras de compraventa 5435" (línea en negrita del artículo real)
        expect(p.cantidad).toBe(5435)
        expect(p.cantidad).toBeGreaterThan(1000)          // ej. 5435
        // "una baja del 3,1% respecto del nivel de un año antes"
        expect(p.varInteranual).toBeCloseTo(-0.031, 5)
        // "Monto involucrado $ 848.932 millones"
        expect(p.montoTexto).toBe('$ 848.932 millones')
        // "En mayo, hubo 587 escrituras formalizadas con hipoteca"
        expect(p.hipotecas).toBe(587)
        expect(p.summary).toContain('escrituras')
        expect(p.summary.length).toBeGreaterThan(60)
        expect(p.summary.length).toBeLessThan(600)
    })
    it('FALLA RUIDOSO con XML sin items', () => {
        expect(() => parseColegioFeed('<rss><channel></channel></rss>')).toThrow(/item/)
    })
})
