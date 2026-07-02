// lib/market-data/caba-map-paths.test.ts
import { describe, it, expect } from 'vitest'
import { CABA_MAP_PATHS, CABA_MAP_VIEWBOX } from './caba-map-paths'
import { ALL_CABA_SLUGS } from './neighborhoods'

describe('caba-map-paths (generado)', () => {
    it('tiene 48 paths con ids únicos = slugs del catálogo', () => {
        expect(CABA_MAP_PATHS).toHaveLength(48)
        const ids = CABA_MAP_PATHS.map(p => p.id).sort()
        expect(ids).toEqual([...ALL_CABA_SLUGS].sort())
    })
    it('todos los paths tienen geometría y color', () => {
        for (const p of CABA_MAP_PATHS) {
            expect(p.d.length).toBeGreaterThan(50)
            expect(p.fill).toMatch(/^#[0-9a-f]{6}$/i)
        }
    })
    it('viewBox razonable (mapa ~526×603)', () => {
        const [, , w, h] = CABA_MAP_VIEWBOX.split(' ').map(Number)
        expect(w).toBeGreaterThan(400); expect(h).toBeGreaterThan(500)
    })
})
