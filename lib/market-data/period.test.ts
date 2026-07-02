import { describe, it, expect } from 'vitest'
import { currentPeriod } from './period'

describe('currentPeriod', () => {
    it('devuelve el primer día del mes vigente en Buenos Aires (UTC-3)', () => {
        // 2026-07-01T01:00Z = 2026-06-30 22:00 ART → período junio
        expect(currentPeriod(new Date('2026-07-01T01:00:00Z'))).toBe('2026-06-01')
        // 2026-07-01T04:00Z = 2026-07-01 01:00 ART → período julio
        expect(currentPeriod(new Date('2026-07-01T04:00:00Z'))).toBe('2026-07-01')
        expect(currentPeriod(new Date('2026-12-31T15:00:00Z'))).toBe('2026-12-01')
    })
})
