import { describe, it, expect } from 'vitest'
import { nextBackoff, isoFromNow, MAX_ATTEMPTS } from './backoff'

describe('nextBackoff', () => {
  it('returns 60 seconds for first attempt', () => {
    expect(nextBackoff(0)).toBe(60)
  })
  it('returns 300 for second', () => {
    expect(nextBackoff(1)).toBe(300)
  })
  it('returns 1500 for third', () => {
    expect(nextBackoff(2)).toBe(1500)
  })
  it('returns 7200 for fourth', () => {
    expect(nextBackoff(3)).toBe(7200)
  })
  it('returns 43200 for fifth', () => {
    expect(nextBackoff(4)).toBe(43200)
  })
  it('returns null past max', () => {
    expect(nextBackoff(5)).toBe(null)
  })
})

describe('MAX_ATTEMPTS', () => {
  it('is 5', () => {
    expect(MAX_ATTEMPTS).toBe(5)
  })
})

describe('isoFromNow', () => {
  it('returns an ISO string in the future', () => {
    const before = Date.now()
    const iso = isoFromNow(60)
    const after = Date.now()
    const parsed = new Date(iso).getTime()
    expect(parsed).toBeGreaterThanOrEqual(before + 60000)
    expect(parsed).toBeLessThanOrEqual(after + 60000)
  })
})
