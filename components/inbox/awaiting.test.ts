import { describe, it, expect } from 'vitest'
import { resolveAwaitingSince, isAwaitingTooLong, waitingFor, countsAsReply, AWAITING_ALERT_THRESHOLD_MS } from './awaiting'

describe('resolveAwaitingSince', () => {
  it('usa awaiting_reply_since del contrato nuevo cuando está', () => {
    const since = '2026-07-30T10:00:00Z'
    expect(
      resolveAwaitingSince({ awaiting_reply_since: since, last_direction: 'out', last_at: '2026-07-30T12:00:00Z', last_status: 'delivered' }),
    ).toBe(since)
  })

  it('sin awaiting_reply_since (API vieja), lo deriva: último entrante = esperando desde last_at', () => {
    expect(
      resolveAwaitingSince({ awaiting_reply_since: undefined, last_direction: 'in', last_at: '2026-07-30T10:00:00Z', last_status: 'received' }),
    ).toBe('2026-07-30T10:00:00Z')
  })

  // `last_status` va explícito desde que la regla es lista blanca: un saliente
  // sin estado conocido NO prueba que el mensaje haya salido, así que la
  // conversación queda como pendiente (ver `countsAsReply`).
  it('último mensaje saliente entregado → no está esperando (null)', () => {
    expect(
      resolveAwaitingSince({ awaiting_reply_since: undefined, last_direction: 'out', last_at: '2026-07-30T10:00:00Z', last_status: 'delivered' }),
    ).toBeNull()
  })

  it('awaiting_reply_since null explícito (el back ya resolvió que no espera) respeta el null', () => {
    expect(
      resolveAwaitingSince({ awaiting_reply_since: null, last_direction: 'out', last_at: '2026-07-30T10:00:00Z', last_status: 'delivered' }),
    ).toBeNull()
  })

  // El caso que separa `null` de `undefined` de verdad: el servidor barre el
  // hilo entero hacia atrás, el respaldo solo mira el ÚLTIMO mensaje. Acá el
  // último mensaje es entrante (el cliente escribió de nuevo DESPUÉS de que le
  // contestaron) y el servidor ya resolvió que la conversación está atendida.
  // Si el `null` cae al respaldo, la conversación vuelve a aparecer como
  // pendiente en la pantalla que el dueño mira todos los días.
  it('awaiting_reply_since null con último mensaje ENTRANTE: manda el servidor, no el respaldo', () => {
    expect(
      resolveAwaitingSince({ awaiting_reply_since: null, last_direction: 'in', last_at: '2026-07-30T10:00:00Z', last_status: 'received' }),
    ).toBeNull()
  })

  it('la nota interna de derivación a humano (agent_handoff) NO cuenta como respuesta', () => {
    expect(
      resolveAwaitingSince({
        awaiting_reply_since: undefined,
        last_direction: 'out',
        last_at: '2026-07-30T10:00:00Z',
        last_status: 'agent_handoff',
      }),
    ).toBe('2026-07-30T10:00:00Z')
  })

  it.each(['accepted', 'sent', 'delivered', 'read'])('un saliente que salió de verdad (%s) sí cuenta como respuesta', status => {
    expect(
      resolveAwaitingSince({
        awaiting_reply_since: undefined,
        last_direction: 'out',
        last_at: '2026-07-30T10:00:00Z',
        last_status: status,
      }),
    ).toBeNull()
  })

  it.each(['failed', 'skipped'])('un saliente que no llegó al cliente (%s) sigue esperando respuesta', status => {
    expect(
      resolveAwaitingSince({
        awaiting_reply_since: undefined,
        last_direction: 'out',
        last_at: '2026-07-30T10:00:00Z',
        last_status: status,
      }),
    ).toBe('2026-07-30T10:00:00Z')
  })
})

describe('countsAsReply', () => {
  it('solo los estados de envío REAL cuentan', () => {
    expect(countsAsReply('accepted')).toBe(true)
    expect(countsAsReply('sent')).toBe(true)
    expect(countsAsReply('delivered')).toBe(true)
    expect(countsAsReply('read')).toBe(true)
  })

  it('lista blanca: cualquier estado INTERNO o desconocido no cuenta', () => {
    expect(countsAsReply('agent_handoff')).toBe(false)
    expect(countsAsReply('failed')).toBe(false)
    expect(countsAsReply('skipped')).toBe(false)
    // El día que aparezca un estado nuevo (interno nuestro o de Meta), la
    // conversación queda VISIBLE como pendiente en vez de desaparecer.
    expect(countsAsReply('un_estado_que_todavia_no_existe')).toBe(false)
    expect(countsAsReply(null)).toBe(false)
    expect(countsAsReply(undefined)).toBe(false)
  })

  it('normaliza mayúsculas y espacios (Meta no siempre manda el estado prolijo)', () => {
    expect(countsAsReply('  DELIVERED ')).toBe(true)
  })
})

// Los tests de `resolveAwaitingSinceFromLastMessage` se borraron junto con la
// función: la cobertura equivalente (y correcta, barriendo el hilo entero) vive
// en `thread-metrics.test.ts` sobre `resolveThreadAwaitingSince`.

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
