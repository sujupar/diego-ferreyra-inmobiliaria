import { describe, it, expect } from 'vitest'
import { polarPoint, donutSlicePath, slicesToArcs } from './arc-geometry'

describe('arc-geometry', () => {
    it('polarPoint: 0°=arriba, 90°=derecha (sentido horario)', () => {
        expect(polarPoint(0, 0, 10, 0).y).toBeCloseTo(-10)
        expect(polarPoint(0, 0, 10, 90).x).toBeCloseTo(10)
        expect(polarPoint(0, 0, 10, 180).y).toBeCloseTo(10)
    })
    it('donutSlicePath produce un path SVG válido sin NaN', () => {
        const p = donutSlicePath(100, 100, 80, 50, -90, 30)
        expect(p).toMatch(/^M .* A .* L .* A .* Z$/)
        expect(p).not.toContain('NaN')
    })
    it('slicesToArcs reparte el total angular por pct y omite slices vacíos', () => {
        const arcs = slicesToArcs([{ pct: 50 }, { pct: 0 }, { pct: 50 }], -90, 180)
        expect(arcs).toHaveLength(2)
        expect(arcs[0].startDeg).toBe(-90); expect(arcs[0].endDeg).toBeCloseTo(0)
        expect(arcs[1].endDeg).toBeCloseTo(90)
    })
    it('un slice de 100% en dona completa no rompe el arco (clamp <360°)', () => {
        const [arc] = slicesToArcs([{ pct: 100 }], 0, 360)
        expect(arc.endDeg - arc.startDeg).toBeLessThan(360)
        expect(donutSlicePath(0, 0, 10, 5, arc.startDeg, arc.endDeg)).not.toContain('NaN')
    })
})
