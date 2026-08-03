import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { needsResync } from './reconcile-core'

describe('needsResync', () => {
  it('coincide → no resync', () => {
    expect(needsResync('seq-agendada', 'seq-agendada')).toBe(false)
    expect(needsResync(null, null)).toBe(false)
  })
  it('difiere → resync (avanzó de etapa entre corridas)', () => {
    expect(needsResync('seq-agendada', 'seq-solicita')).toBe(true)
  })
  it('pasó a STOP pero el ledger tenía un tag → resync (hay que desactivar)', () => {
    expect(needsResync(null, 'seq-seguimiento')).toBe(true)
  })
  it('nunca sincronizado (ledger null) pero ahora corresponde tag → resync', () => {
    expect(needsResync('seq-solicita', null)).toBe(true)
  })
})
