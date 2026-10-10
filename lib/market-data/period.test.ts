import { describe, it, expect } from 'vitest'
import { currentPeriod, periodoAnterior } from './period'

describe('currentPeriod', () => {
    it('devuelve el primer día del mes vigente en Buenos Aires (UTC-3)', () => {
        // 2026-07-01T01:00Z = 2026-06-30 22:00 ART → período junio
        expect(currentPeriod(new Date('2026-07-01T01:00:00Z'))).toBe('2026-06-01')
        // 2026-07-01T04:00Z = 2026-07-01 01:00 ART → período julio
        expect(currentPeriod(new Date('2026-07-01T04:00:00Z'))).toBe('2026-07-01')
        expect(currentPeriod(new Date('2026-12-31T15:00:00Z'))).toBe('2026-12-01')
    })
})

describe('periodoAnterior', () => {
    it('devuelve el primer día del mes anterior', () => {
        expect(periodoAnterior('2026-10-01')).toBe('2026-09-01')
    })
    it('cruza el año cuando el período es enero', () => {
        expect(periodoAnterior('2026-01-01')).toBe('2025-12-01')
    })
    it('ignora el día del período y devuelve siempre el día 1', () => {
        expect(periodoAnterior('2026-03-15')).toBe('2026-02-01')
    })
})
