import { describe, it, expect } from 'vitest'
import { computeThreadMetrics } from './thread-metrics'

function m(direction: 'in' | 'out', createdAt: string) {
  return { direction, created_at: createdAt } as const
}

describe('computeThreadMetrics', () => {
  it('sin mensajes, todo en null/0', () => {
    expect(computeThreadMetrics([])).toEqual({
      firstResponseMs: null,
      avgResponseMs: null,
      inboundCount: 0,
      outboundCount: 0,
    })
  })

  it('cuenta entrantes y salientes por separado', () => {
    const r = computeThreadMetrics([
      m('in', '2026-07-30T10:00:00Z'),
      m('out', '2026-07-30T10:05:00Z'),
      m('in', '2026-07-30T10:10:00Z'),
    ])
    expect(r.inboundCount).toBe(2)
    expect(r.outboundCount).toBe(1)
  })

  it('primera respuesta = tiempo entre el primer entrante y el primer saliente que sigue', () => {
    const r = computeThreadMetrics([m('in', '2026-07-30T10:00:00Z'), m('out', '2026-07-30T10:05:00Z')])
    expect(r.firstResponseMs).toBe(5 * 60000)
  })

  it('varios entrantes seguidos sin saliente en el medio cuentan como UNA sola espera', () => {
    const r = computeThreadMetrics([
      m('in', '2026-07-30T10:00:00Z'),
      m('in', '2026-07-30T10:02:00Z'),
      m('in', '2026-07-30T10:04:00Z'),
      m('out', '2026-07-30T10:10:00Z'),
    ])
    // Se mide desde el PRIMER entrante de la racha, no desde el último.
    expect(r.firstResponseMs).toBe(10 * 60000)
  })

  it('el orden de entrada no importa — se ordena por fecha antes de calcular', () => {
    const r = computeThreadMetrics([m('out', '2026-07-30T10:05:00Z'), m('in', '2026-07-30T10:00:00Z')])
    expect(r.firstResponseMs).toBe(5 * 60000)
  })

  it('promedio de varias respuestas', () => {
    const r = computeThreadMetrics([
      m('in', '2026-07-30T10:00:00Z'),
      m('out', '2026-07-30T10:10:00Z'), // 10 min
      m('in', '2026-07-30T11:00:00Z'),
      m('out', '2026-07-30T11:20:00Z'), // 20 min
    ])
    expect(r.firstResponseMs).toBe(10 * 60000)
    expect(r.avgResponseMs).toBe(15 * 60000)
  })

  it('un entrante sin ninguna respuesta después no aporta a las métricas de tiempo (sigue null)', () => {
    const r = computeThreadMetrics([m('in', '2026-07-30T10:00:00Z')])
    expect(r.firstResponseMs).toBeNull()
    expect(r.avgResponseMs).toBeNull()
    expect(r.inboundCount).toBe(1)
  })

  it('saliente sin ningún entrante antes (el equipo escribe primero) no cuenta como respuesta', () => {
    const r = computeThreadMetrics([m('out', '2026-07-30T10:00:00Z')])
    expect(r.firstResponseMs).toBeNull()
    expect(r.outboundCount).toBe(1)
  })
})
