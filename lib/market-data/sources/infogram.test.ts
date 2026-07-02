// lib/market-data/sources/infogram.test.ts
import { describe, it, expect } from 'vitest'
import { fetchInfogramComposition, INFOGRAM_EMBED_URL } from './infogram'

describe('infogram (fuente diferida)', () => {
    it('devuelve ok:false con error accionable (nunca datos fabricados)', async () => {
        const r = await fetchInfogramComposition()
        expect(r.ok).toBe(false)
        if (!r.ok) {
            expect(r.error).toMatch(/DIFERIDA/i)
            expect(r.error).toMatch(/401/)
            expect(r.error).toMatch(/render=true|daniel@bryn/i)
        }
    })
    it('no toca la red (resuelve inmediato)', async () => {
        const t0 = Date.now()
        await fetchInfogramComposition()
        expect(Date.now() - t0).toBeLessThan(100)
    })
    it('exporta la URL del embed para diagnóstico', () => {
        expect(INFOGRAM_EMBED_URL).toContain('e.infogram.com')
    })
})
