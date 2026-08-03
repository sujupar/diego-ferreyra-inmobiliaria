import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { computeTagOps } from './tag-ops'

describe('computeTagOps', () => {
  it('activa el target y desactiva los otros 4', () => {
    expect(computeTagOps('seq-agendada')).toEqual({
      activate: 'seq-agendada',
      deactivate: ['seq-solicita', 'seq-no-realizada', 'seq-realizada', 'seq-seguimiento'],
    })
  })
  it('target null (STOP) → no activa nada y desactiva los 5', () => {
    expect(computeTagOps(null)).toEqual({
      activate: null,
      deactivate: ['seq-solicita', 'seq-agendada', 'seq-no-realizada', 'seq-realizada', 'seq-seguimiento'],
    })
  })
})
