import { describe, it, expect } from 'vitest'
import { resolveAwaitingSince, resolveAwaitingSinceFromLastMessage, isAwaitingTooLong, waitingFor, AWAITING_ALERT_THRESHOLD_MS } from './awaiting'

describe('resolveAwaitingSince', () => {
  it('usa awaiting_reply_since del contrato nuevo cuando está', () => {
    const since = '2026-07-30T10:00:00Z'
    expect(
      resolveAwaitingSince({ awaiting_reply_since: since, last_direction: 'out', last_at: '2026-07-30T12:00:00Z' }),
    ).toBe(since)
  })

  it('sin awaiting_reply_since (API vieja), lo deriva: último entrante = esperando desde last_at', () => {
    expect(resolveAwaitingSince({ awaiting_reply_since: undefined, last_direction: 'in', last_at: '2026-07-30T10:00:00Z' })).toBe(
      '2026-07-30T10:00:00Z',
    )
  })

  it('último mensaje saliente → no está esperando (null)', () => {
    expect(resolveAwaitingSince({ awaiting_reply_since: undefined, last_direction: 'out', last_at: '2026-07-30T10:00:00Z' })).toBeNull()
  })

  it('awaiting_reply_since null explícito (el back ya resolvió que no espera) respeta el null', () => {
    expect(resolveAwaitingSince({ awaiting_reply_since: null, last_direction: 'out', last_at: '2026-07-30T10:00:00Z' })).toBeNull()
  })
})

describe('resolveAwaitingSinceFromLastMessage', () => {
  it('sin mensajes, no espera nada', () => {
    expect(resolveAwaitingSinceFromLastMessage(undefined)).toBeNull()
  })
  it('último mensaje entrante → esperando desde su fecha', () => {
    expect(resolveAwaitingSinceFromLastMessage({ direction: 'in', created_at: '2026-07-30T10:00:00Z' })).toBe('2026-07-30T10:00:00Z')
  })
  it('último mensaje saliente → no espera', () => {
    expect(resolveAwaitingSinceFromLastMessage({ direction: 'out', created_at: '2026-07-30T10:00:00Z' })).toBeNull()
  })
})

describe('isAwaitingTooLong', () => {
  const now = new Date('2026-07-30T12:00:00Z').getTime()
  it('null nunca es "demasiado tiempo"', () => {
    expect(isAwaitingTooLong(null, now)).toBe(false)
  })
  it('menos del umbral, no alerta', () => {
    const since = new Date(now - (AWAITING_ALERT_THRESHOLD_MS - 60000)).toISOString()
    expect(isAwaitingTooLong(since, now)).toBe(false)
  })
  it('igual o más del umbral, alerta', () => {
    const since = new Date(now - AWAITING_ALERT_THRESHOLD_MS).toISOString()
    expect(isAwaitingTooLong(since, now)).toBe(true)
  })
})

describe('waitingFor', () => {
  const now = new Date('2026-07-30T12:00:00Z').getTime()
  it('minutos', () => {
    expect(waitingFor(new Date(now - 5 * 60000).toISOString(), now)).toBe('hace 5 min')
  })
  it('horas', () => {
    expect(waitingFor(new Date(now - 3 * 3600000).toISOString(), now)).toBe('hace 3 h')
  })
  it('días', () => {
    expect(waitingFor(new Date(now - 2 * 86400000).toISOString(), now)).toBe('hace 2 días')
  })
})
