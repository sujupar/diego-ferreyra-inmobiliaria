import { describe, it, expect } from 'vitest'
import { decideBudget } from './budget-rules'

const RATE = 1200 // tasa fija para tests

describe('decideBudget', () => {
  it('tier entry para USD 80k', () => {
    const d = decideBudget(80_000, 'USD', RATE)
    expect(d.dailyArs).toBe(5_000)
    expect(d.tier.label).toContain('Entry')
  })

  it('tier mid para USD 150k', () => {
    const d = decideBudget(150_000, 'USD', RATE)
    expect(d.dailyArs).toBe(10_000)
  })

  it('tier upper para USD 500k', () => {
    const d = decideBudget(500_000, 'USD', RATE)
    expect(d.dailyArs).toBe(15_000)
  })

  it('tier premium para USD 1M', () => {
    const d = decideBudget(1_000_000, 'USD', RATE)
    expect(d.dailyArs).toBe(25_000)
    expect(d.tier.label).toContain('Premium')
  })

  it('boundary: USD 100k exacto va al entry tier', () => {
    expect(decideBudget(100_000, 'USD', RATE).dailyArs).toBe(5_000)
  })

  it('boundary: USD 100,001 va al mid', () => {
    expect(decideBudget(100_001, 'USD', RATE).dailyArs).toBe(10_000)
  })

  it('precio en ARS se convierte usando el rate inyectado', () => {
    // 200M ARS @ 1000 = USD 200k → tier mid
    const d = decideBudget(200_000_000, 'ARS', 1000)
    expect(d.dailyArs).toBe(10_000)
  })

  it('reasoning string es informativo', () => {
    const d = decideBudget(250_000, 'USD', RATE)
    expect(d.reasoning).toContain('250000')
    expect(d.reasoning).toContain('Mid')
  })
})
