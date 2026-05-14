import { describe, it, expect, beforeEach } from 'vitest'
import { decideBudget } from './budget-rules'

describe('decideBudget', () => {
  beforeEach(() => {
    delete process.env.USD_TO_ARS
  })

  it('tier entry para USD 80k', () => {
    const d = decideBudget(80_000, 'USD')
    expect(d.dailyArs).toBe(5_000)
    expect(d.tier.label).toContain('Entry')
  })

  it('tier mid para USD 150k', () => {
    const d = decideBudget(150_000, 'USD')
    expect(d.dailyArs).toBe(10_000)
  })

  it('tier upper para USD 500k', () => {
    const d = decideBudget(500_000, 'USD')
    expect(d.dailyArs).toBe(15_000)
  })

  it('tier premium para USD 1M', () => {
    const d = decideBudget(1_000_000, 'USD')
    expect(d.dailyArs).toBe(25_000)
    expect(d.tier.label).toContain('Premium')
  })

  it('boundary: USD 100k exacto va al entry tier', () => {
    expect(decideBudget(100_000, 'USD').dailyArs).toBe(5_000)
  })

  it('boundary: USD 100,001 va al mid', () => {
    expect(decideBudget(100_001, 'USD').dailyArs).toBe(10_000)
  })

  it('precio en ARS se convierte usando USD_TO_ARS env', () => {
    process.env.USD_TO_ARS = '1000'
    // 200M ARS = USD 200k → tier mid
    const d = decideBudget(200_000_000, 'ARS')
    expect(d.dailyArs).toBe(10_000)
  })

  it('reasoning string es informativo', () => {
    const d = decideBudget(250_000, 'USD')
    expect(d.reasoning).toContain('250000')
    expect(d.reasoning).toContain('Mid')
  })
})
