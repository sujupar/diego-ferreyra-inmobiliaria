import { describe, it, expect } from 'vitest'
import { computeDiff } from './funnel-audience-sync'

describe('computeDiff', () => {
  it('toAdd = deseados no en ledger; toRemove = en ledger pero ya no deseados', () => {
    const desired = new Set(['c1', 'c2', 'c3'])
    const ledger = new Set(['c2', 'c4'])
    const { toAdd, toRemove } = computeDiff(desired, ledger)
    expect(toAdd.sort()).toEqual(['c1', 'c3'])
    expect(toRemove.sort()).toEqual(['c4'])
  })
  it('sin cambios → vacíos', () => {
    const { toAdd, toRemove } = computeDiff(new Set(['a']), new Set(['a']))
    expect(toAdd).toEqual([]); expect(toRemove).toEqual([])
  })
})
