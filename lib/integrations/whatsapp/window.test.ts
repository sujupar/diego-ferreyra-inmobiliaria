import { describe, it, expect } from 'vitest'
import { serviceWindow } from './window'

const LAST_INBOUND = '2026-07-28T12:00:00.000Z'

describe('serviceWindow', () => {
  it('está abierta a las 23h59 desde el último entrante', () => {
    const now = new Date('2026-07-29T11:59:00.000Z') // +23h59
    const result = serviceWindow(LAST_INBOUND, now)
    expect(result.open).toBe(true)
    expect(result.msRemaining).toBeGreaterThan(0)
    expect(result.msRemaining).toBe(60_000) // queda 1 minuto
  })

  it('está cerrada a las 24h01 desde el último entrante', () => {
    const now = new Date('2026-07-29T12:01:00.000Z') // +24h01
    const result = serviceWindow(LAST_INBOUND, now)
    expect(result.open).toBe(false)
    expect(result.msRemaining).toBe(0)
  })

  it('justo en el borde de 24h ya está cerrada (estrictamente mayor a 0)', () => {
    const now = new Date('2026-07-29T12:00:00.000Z') // exactamente +24h
    const result = serviceWindow(LAST_INBOUND, now)
    expect(result.open).toBe(false)
    expect(result.msRemaining).toBe(0)
  })

  it('está cerrada si nunca hubo un entrante (null)', () => {
    const result = serviceWindow(null, new Date('2026-07-29T12:00:00.000Z'))
    expect(result.open).toBe(false)
    expect(result.msRemaining).toBe(0)
  })

  it('está cerrada ante un timestamp inválido (nunca revienta)', () => {
    const result = serviceWindow('no-es-una-fecha', new Date())
    expect(result.open).toBe(false)
    expect(result.msRemaining).toBe(0)
  })
})
