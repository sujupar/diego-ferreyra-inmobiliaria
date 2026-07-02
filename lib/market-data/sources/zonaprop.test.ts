// lib/market-data/sources/zonaprop.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseZonapropBarrioHtml, ZONAPROP_BARRIO_URL } from './zonaprop'

const FIX = join(__dirname, '../__fixtures__/zonaprop-palermo.html')

describe('zonaprop', () => {
    it('arma la URL directa por barrio', () => {
        expect(ZONAPROP_BARRIO_URL('palermo')).toBe('https://www.zonaprop.com.ar/barrios/capital-federal/palermo')
    })
    it.skipIf(!existsSync(FIX))('extrae los 6 conteos del HTML real de Palermo', () => {
        const c = parseZonapropBarrioHtml(readFileSync(FIX, 'utf8'))
        expect(c.departamentos).toBeGreaterThan(1000)   // Palermo: miles de deptos
        expect(c.total).toBeGreaterThan(1000)
        // los 6 campos presentes (pueden ser 0 pero no undefined)
        for (const k of ['departamentos', 'terrenos', 'locales', 'casas', 'ph', 'oficinas'] as const) {
            expect(c[k]).not.toBeUndefined()
        }
    })
    it('FALLA RUIDOSO con HTML sin datos', () => {
        expect(() => parseZonapropBarrioHtml('<html><body>bloqueado</body></html>')).toThrow(/conteos/)
    })
})
