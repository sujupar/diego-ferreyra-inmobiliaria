// lib/market-data/sources/bryn.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseBrynJson, parseBarriosFromMapHtml } from './bryn'

const FIX = join(__dirname, '../__fixtures__')
const raw = JSON.parse(readFileSync(join(FIX, 'bryn.json'), 'utf8'))
const mapHtml = readFileSync(join(FIX, 'map-sample.html'), 'utf8')

describe('parseBrynJson', () => {
    it('devuelve los 48 barrios con slug canónico y precio', () => {
        const p = parseBrynJson(raw)
        expect(p.barrios).toHaveLength(48)
        const palermo = p.barrios.find(b => b.slug === 'palermo')!
        expect(palermo.name).toBe('Palermo')
        expect(palermo.price.prom).toBeGreaterThan(500)
        expect(palermo.price.deptos).toBeGreaterThan(100)
        // renta/vm/via son decimales (0.05 = 5%)
        expect(Math.abs(palermo.price.renta ?? 99)).toBeLessThan(1)
    })
    it('extrae los KPIs de stock y el panel de precio CABA', () => {
        const p = parseBrynJson(raw)
        expect(p.stockKpis.stockDeptos).toBeGreaterThan(10000)
        expect(p.cabaPrice.prom).toBeGreaterThan(500)
        expect(p.extraOferta.terrenos).toBeGreaterThan(100)
    })
    it('FALLA RUIDOSO si el shape cambia (no devuelve datos a medias)', () => {
        expect(() => parseBrynJson({ kpis: {}, barrios: [] })).toThrow(/48/)
        expect(() => parseBrynJson(null)).toThrow()
        expect(() => parseBrynJson({ kpis: {}, barrios: raw.barrios.slice(0, 10) })).toThrow(/48/)
    })
})

describe('parseBarriosFromMapHtml (fallback)', () => {
    it('extrae precio/vm/via/renta/deptos de los data-* de los 48 paths', () => {
        const rows = parseBarriosFromMapHtml(mapHtml)
        expect(rows.length).toBe(48)
        const pal = rows.find(r => r.slug === 'palermo')!
        expect(pal.price.prom).toBeGreaterThan(500)
        expect(pal.price.deptos).toBeGreaterThan(100)
    })
    it('bug del mapa en origen: villa-general-mitre entra con precios null (su polígono trae los datos de Villa Ortúzar)', () => {
        const rows = parseBarriosFromMapHtml(mapHtml)
        const vgm = rows.find(r => r.slug === 'villa-general-mitre')!
        expect(vgm).toBeDefined()
        expect(vgm.price.prom).toBeNull() // NUNCA los 2635 de Villa Ortúzar
        const ortuzar = rows.find(r => r.slug === 'villa-ortuzar')!
        expect(ortuzar.price.prom).toBeGreaterThan(500)
    })
})
