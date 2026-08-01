import { describe, it, expect } from 'vitest'
import { computeThreadMetrics, resolveThreadAwaitingSince } from './thread-metrics'

/** `status` por default 'delivered' = un mensaje que salió de verdad (el caso normal). */
function m(direction: 'in' | 'out', createdAt: string, status = direction === 'in' ? 'received' : 'delivered') {
  return { direction, created_at: createdAt, status } as const
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

  // --- Filas salientes que NUNCA salen hacia el cliente (notas internas del
  // agente de IA + envíos que rebotaron). Antes contaban como "el equipo
  // respondió" y encima falseaban el tiempo: una nota interna se escribe al
  // instante, así que el panel mostraba "primera respuesta: 1 min" en una
  // conversación donde el cliente sigue esperando.
  it.each(['agent_handoff', 'agent_visit_pending', 'agent_visit_failed'])(
    'la nota interna del agente de IA (%s) no cuenta como respuesta ni falsea el tiempo',
    status => {
      const r = computeThreadMetrics([
        m('in', '2026-07-30T10:00:00Z'),
        m('out', '2026-07-30T10:01:00Z', status), // nota interna, instantánea
        m('out', '2026-07-30T10:40:00Z'), // la respuesta REAL, 40 min después
      ])
      expect(r.firstResponseMs).toBe(40 * 60000)
      expect(r.avgResponseMs).toBe(40 * 60000)
      expect(r.outboundCount).toBe(1)
    },
  )

  it('un hilo que termina en nota interna sigue SIN respuesta', () => {
    const r = computeThreadMetrics([m('in', '2026-07-30T10:00:00Z'), m('out', '2026-07-30T10:01:00Z', 'agent_handoff')])
    expect(r.firstResponseMs).toBeNull()
    expect(r.avgResponseMs).toBeNull()
    expect(r.outboundCount).toBe(0)
    expect(r.inboundCount).toBe(1)
  })

  it.each(['failed', 'skipped'])('un saliente que no llegó al cliente (%s) tampoco es una respuesta', status => {
    const r = computeThreadMetrics([m('in', '2026-07-30T10:00:00Z'), m('out', '2026-07-30T10:05:00Z', status)])
    expect(r.firstResponseMs).toBeNull()
    expect(r.outboundCount).toBe(0)
  })

  it.each(['accepted', 'sent', 'delivered', 'read'])('un saliente que salió de verdad (%s) sí es una respuesta', status => {
    const r = computeThreadMetrics([m('in', '2026-07-30T10:00:00Z'), m('out', '2026-07-30T10:05:00Z', status)])
    expect(r.firstResponseMs).toBe(5 * 60000)
    expect(r.outboundCount).toBe(1)
  })
})

describe('resolveThreadAwaitingSince', () => {
  it('hilo vacío, no espera nada', () => {
    expect(resolveThreadAwaitingSince([])).toBeNull()
  })

  it('último mensaje entrante → espera desde ese mensaje', () => {
    expect(resolveThreadAwaitingSince([m('out', '2026-07-30T09:00:00Z'), m('in', '2026-07-30T10:00:00Z')])).toBe('2026-07-30T10:00:00Z')
  })

  it('hubo respuesta real después del último entrante → no hay espera', () => {
    expect(resolveThreadAwaitingSince([m('in', '2026-07-30T10:00:00Z'), m('out', '2026-07-30T10:05:00Z')])).toBeNull()
  })

  // El corazón del arreglo: la franja mide desde el mensaje DEL CLIENTE, no
  // desde nuestra nota interna. Antes tomaba el `created_at` de la nota y decía
  // "el cliente escribió hace 1 min" cuando en realidad hacía 3 horas.
  it.each(['agent_handoff', 'agent_visit_pending', 'agent_visit_failed'])(
    'último mensaje = nota interna (%s) → la espera se mide desde el entrante, no desde la nota',
    status => {
      expect(
        resolveThreadAwaitingSince([m('in', '2026-07-30T10:00:00Z'), m('out', '2026-07-30T13:00:00Z', status)]),
      ).toBe('2026-07-30T10:00:00Z')
    },
  )

  it('último mensaje = saliente que rebotó → la espera se mide desde el entrante', () => {
    expect(resolveThreadAwaitingSince([m('in', '2026-07-30T10:00:00Z'), m('out', '2026-07-30T13:00:00Z', 'failed')])).toBe(
      '2026-07-30T10:00:00Z',
    )
  })

  it('varios entrantes sin responder → cuenta desde el MÁS RECIENTE (mismo criterio que el server)', () => {
    expect(
      resolveThreadAwaitingSince([
        m('in', '2026-07-30T10:00:00Z'),
        m('in', '2026-07-30T11:00:00Z'),
        m('out', '2026-07-30T13:00:00Z', 'agent_handoff'),
      ]),
    ).toBe('2026-07-30T11:00:00Z')
  })

  it('la espera arranca DESPUÉS de la última respuesta real, no antes', () => {
    expect(
      resolveThreadAwaitingSince([
        m('in', '2026-07-30T08:00:00Z'),
        m('out', '2026-07-30T08:30:00Z'), // respuesta real: cierra esa espera
        m('in', '2026-07-30T09:00:00Z'),
        m('out', '2026-07-30T09:10:00Z', 'agent_visit_failed'), // nota interna: no cierra nada
      ]),
    ).toBe('2026-07-30T09:00:00Z')
  })

  it('hilo de puras notas internas sin ningún entrante → no hay nada que reclamar', () => {
    expect(resolveThreadAwaitingSince([m('out', '2026-07-30T10:00:00Z', 'agent_handoff')])).toBeNull()
  })

  it('el orden de entrada no importa — se ordena por fecha antes de calcular', () => {
    expect(
      resolveThreadAwaitingSince([m('out', '2026-07-30T13:00:00Z', 'agent_handoff'), m('in', '2026-07-30T10:00:00Z')]),
    ).toBe('2026-07-30T10:00:00Z')
  })
})
