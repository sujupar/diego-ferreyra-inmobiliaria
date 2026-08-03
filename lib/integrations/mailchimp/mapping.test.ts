import { describe, it, expect, vi } from 'vitest'

// `mapping.ts` importa `server-only` (no resuelve bajo vitest)
vi.mock('server-only', () => ({}))

import { resolveSequenceTag, ALL_SEQUENCE_TAGS } from './mapping'

describe('resolveSequenceTag', () => {
  it('request + embudo → seq-solicita', () => {
    expect(resolveSequenceTag({ stage: 'request', origin: 'embudo', scheduledDate: null })).toBe('seq-solicita')
  })
  it('request + otro origin → null (Solicita es solo embudo)', () => {
    expect(resolveSequenceTag({ stage: 'request', origin: 'referido', scheduledDate: null })).toBeNull()
  })
  it('scheduled CON fecha → seq-agendada', () => {
    expect(resolveSequenceTag({ stage: 'scheduled', origin: 'embudo', scheduledDate: '2026-08-10' })).toBe('seq-agendada')
  })
  it('scheduled SIN fecha + embudo → seq-solicita (semántica CRM: es "solicitud")', () => {
    expect(resolveSequenceTag({ stage: 'scheduled', origin: 'embudo', scheduledDate: null })).toBe('seq-solicita')
  })
  it('scheduled SIN fecha + no-embudo → null', () => {
    expect(resolveSequenceTag({ stage: 'scheduled', origin: null, scheduledDate: null })).toBeNull()
  })
  it('not_visited → seq-no-realizada', () => {
    expect(resolveSequenceTag({ stage: 'not_visited', origin: 'embudo', scheduledDate: null })).toBe('seq-no-realizada')
  })
  it('visited → seq-realizada', () => {
    expect(resolveSequenceTag({ stage: 'visited', origin: 'embudo', scheduledDate: null })).toBe('seq-realizada')
  })
  it('appraisal_sent y followup → seq-seguimiento (misma fase)', () => {
    expect(resolveSequenceTag({ stage: 'appraisal_sent', origin: 'embudo', scheduledDate: null })).toBe('seq-seguimiento')
    expect(resolveSequenceTag({ stage: 'followup', origin: 'embudo', scheduledDate: null })).toBe('seq-seguimiento')
  })
  it('captured / lost / comprador / clase_gratuita → null (STOP)', () => {
    for (const stage of ['captured', 'lost', 'comprador', 'clase_gratuita']) {
      expect(resolveSequenceTag({ stage, origin: 'embudo', scheduledDate: null })).toBeNull()
    }
  })
  it('ALL_SEQUENCE_TAGS tiene los 5 tags primarios', () => {
    expect(ALL_SEQUENCE_TAGS).toEqual(['seq-solicita', 'seq-agendada', 'seq-no-realizada', 'seq-realizada', 'seq-seguimiento'])
  })
})
