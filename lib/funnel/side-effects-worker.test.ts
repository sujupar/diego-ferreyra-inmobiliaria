/**
 * Tests del worker de avisos del embudo.
 *
 * Lo que se protege: que un aviso que falla NO se lleve puestos a los otros
 * cuatro, que un trabajo tomado por un worker que murió vuelva a la cola, y que
 * los reintentos se agoten en vez de repetirse para siempre.
 *
 * El Supabase falso de acá modela lo único de Postgres que importa para esto:
 * que `update ... where id = X and status = 'pending'` devuelva fila SOLO si el
 * trabajo seguía libre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TipoDeTrabajo } from './jobs-logic'

vi.mock('server-only', () => ({}))

interface Fila {
  id: string
  submission_id: string
  kind: TipoDeTrabajo
  payload: Record<string, unknown>
  status: string
  attempts: number
  max_attempts: number
  next_attempt_at: string
  claimed_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

const bd = vi.hoisted(() => ({
  trabajos: [] as Array<Record<string, unknown>>,
  /** Qué hace cada tipo de trabajo cuando el worker lo ejecuta. */
  comportamiento: {} as Record<string, 'ok' | 'skip' | 'explota'>,
  /** Tipos ejecutados, en orden. */
  ejecutados: [] as string[],
  /** Escalaciones a admins (trabajo agotado). */
  escalaciones: [] as Array<{ tipo: string; error: string }>,
}))

vi.mock('@supabase/supabase-js', () => {
  function constructor() {
    const filtros: Array<(f: Record<string, unknown>) => boolean> = []
    let modo: 'select' | 'update' = 'select'
    let cambios: Record<string, unknown> = {}

    async function resolver() {
      await Promise.resolve()
      const coinciden = bd.trabajos.filter((f) => filtros.every((p) => p(f)))
      if (modo === 'update') {
        for (const f of coinciden) Object.assign(f, cambios)
      }
      return { data: coinciden.map((f) => ({ ...f })), error: null }
    }

    const q: Record<string, unknown> = {
      select: () => q,
      update: (row: Record<string, unknown>) => { modo = 'update'; cambios = row; return q },
      eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return q },
      lt: (c: string, v: string) => { filtros.push((f) => f[c] !== null && String(f[c]) < v); return q },
      lte: (c: string, v: string) => { filtros.push((f) => String(f[c] ?? '') <= v); return q },
      order: () => q,
      limit: () => q,
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => resolver().then(res, rej),
    }
    return q
  }
  return { createClient: () => ({ from: () => constructor() }) }
})

vi.mock('@/lib/funnel/side-effect-handlers', () => ({
  ejecutarTrabajo: async (kind: string) => {
    bd.ejecutados.push(kind)
    const c = bd.comportamiento[kind] ?? 'ok'
    if (c === 'explota') throw new Error(`${kind} explotó`)
    return c === 'skip' ? 'skipped' : 'done'
  },
}))

vi.mock('@/lib/email/notifications/admin-failure-alert', () => ({
  notifyAdminEmailFailure: async (p: { failedNotificationType: string; errors: string[] }) => {
    bd.escalaciones.push({ tipo: p.failedNotificationType, error: p.errors[0] })
  },
}))

import { runFunnelSideEffectsWorker } from './side-effects-worker'

function trabajo(over: Partial<Fila> = {}): Record<string, unknown> {
  return {
    id: over.id ?? 'j1',
    submission_id: over.submission_id ?? 'envio-1',
    kind: over.kind ?? 'notify',
    payload: over.payload ?? {},
    status: over.status ?? 'pending',
    attempts: over.attempts ?? 0,
    max_attempts: over.max_attempts ?? 5,
    next_attempt_at: over.next_attempt_at ?? '2026-01-01T00:00:00.000Z',
    claimed_at: over.claimed_at ?? null,
    last_error: over.last_error ?? null,
    created_at: over.created_at ?? '2026-08-08T12:00:00.000Z',
    updated_at: over.updated_at ?? '2026-08-08T12:00:00.000Z',
  }
}

const CINCO: TipoDeTrabajo[] = ['coordinator_task', 'notify', 'mailchimp', 'anon_stitch', 'capi']

beforeEach(() => {
  bd.trabajos = []
  bd.comportamiento = {}
  bd.ejecutados = []
  bd.escalaciones = []
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
})

describe('toma y termina', () => {
  it('toma un trabajo pendiente y lo deja en done', async () => {
    bd.trabajos = [trabajo()]
    const r = await runFunnelSideEffectsWorker()

    expect(bd.ejecutados).toEqual(['notify'])
    expect(bd.trabajos[0]).toMatchObject({ status: 'done', attempts: 1, claimed_at: null, last_error: null })
    expect(r).toMatchObject({ ok: true, hechos: 1, fallados: 0, reintentar: 0 })
  })

  it('un trabajo que no correspondía hacer queda en skipped, no en done', async () => {
    bd.trabajos = [trabajo({ id: 'j1', kind: 'anon_stitch' })]
    bd.comportamiento.anon_stitch = 'skip'
    const r = await runFunnelSideEffectsWorker()

    expect(bd.trabajos[0].status).toBe('skipped')
    expect(r).toMatchObject({ hechos: 0, salteados: 1 })
  })

  it('no toca trabajos cuya próxima fecha todavía no llegó', async () => {
    bd.trabajos = [trabajo({ next_attempt_at: new Date(Date.now() + 60_000).toISOString() })]
    await runFunnelSideEffectsWorker()
    expect(bd.ejecutados).toEqual([])
    expect(bd.trabajos[0].status).toBe('pending')
  })

  it('gasta el intento AL TOMAR: un trabajo que mata al worker no queda dando vueltas eterno', async () => {
    bd.trabajos = [trabajo()]
    bd.comportamiento.notify = 'explota'
    await runFunnelSideEffectsWorker()
    expect(bd.trabajos[0].attempts).toBe(1)
  })
})

describe('reintentos y agotamiento', () => {
  it('un fallo vuelve a pending con una espera por delante', async () => {
    bd.trabajos = [trabajo()]
    bd.comportamiento.notify = 'explota'
    const r = await runFunnelSideEffectsWorker()

    const t = bd.trabajos[0]
    expect(t.status).toBe('pending')
    expect(t.attempts).toBe(1)
    expect(t.last_error).toContain('notify explotó')
    expect(Date.parse(String(t.next_attempt_at))).toBeGreaterThan(Date.now())
    expect(r).toMatchObject({ reintentar: 1, fallados: 0 })
    expect(bd.escalaciones).toEqual([])
  })

  it('la espera crece entre corridas', async () => {
    bd.trabajos = [trabajo()]
    bd.comportamiento.notify = 'explota'

    await runFunnelSideEffectsWorker()
    const primera = Date.parse(String(bd.trabajos[0].next_attempt_at)) - Date.now()

    bd.trabajos[0].next_attempt_at = '2026-01-01T00:00:00.000Z' // se cumple la espera
    await runFunnelSideEffectsWorker()
    const segunda = Date.parse(String(bd.trabajos[0].next_attempt_at)) - Date.now()

    expect(segunda).toBeGreaterThan(primera)
    expect(bd.trabajos[0].attempts).toBe(2)
  })

  it('al agotar los intentos queda en failed y RECIÉN AHÍ se avisa a los admins', async () => {
    bd.trabajos = [trabajo({ attempts: 4, max_attempts: 5 })]
    bd.comportamiento.notify = 'explota'
    const r = await runFunnelSideEffectsWorker()

    expect(bd.trabajos[0]).toMatchObject({ status: 'failed', attempts: 5 })
    expect(r).toMatchObject({ fallados: 1, reintentar: 0 })
    expect(bd.escalaciones).toEqual([{ tipo: 'embudo:notify', error: 'notify explotó' }])
  })

  it('un failed no se vuelve a tomar en la corrida siguiente', async () => {
    bd.trabajos = [trabajo({ attempts: 4, max_attempts: 5 })]
    bd.comportamiento.notify = 'explota'
    await runFunnelSideEffectsWorker()
    bd.ejecutados = []
    await runFunnelSideEffectsWorker()
    expect(bd.ejecutados).toEqual([])
  })
})

describe('aislamiento entre avisos', () => {
  it('un aviso que falla NO afecta a los otros cuatro', async () => {
    bd.trabajos = CINCO.map((kind, i) => trabajo({ id: `j${i}`, kind }))
    bd.comportamiento.notify = 'explota'

    const r = await runFunnelSideEffectsWorker()

    expect(bd.ejecutados.sort()).toEqual([...CINCO].sort())
    const porTipo = Object.fromEntries(bd.trabajos.map((t) => [t.kind, t.status]))
    expect(porTipo).toEqual({
      notify: 'pending', // el que falló, esperando su reintento
      coordinator_task: 'done',
      mailchimp: 'done',
      anon_stitch: 'done',
      capi: 'done',
    })
    expect(r).toMatchObject({ hechos: 4, reintentar: 1 })
  })

  it('el email se atiende antes que el evento de Meta', async () => {
    bd.trabajos = CINCO.map((kind, i) => trabajo({ id: `j${i}`, kind }))
    await runFunnelSideEffectsWorker()
    expect(bd.ejecutados.indexOf('notify')).toBeLessThan(bd.ejecutados.indexOf('capi'))
  })
})

describe('el reaper', () => {
  it('un trabajo running colgado hace rato vuelve a pending y se ejecuta', async () => {
    bd.trabajos = [
      trabajo({ status: 'running', claimed_at: new Date(Date.now() - 30 * 60_000).toISOString(), attempts: 1 }),
    ]
    const r = await runFunnelSideEffectsWorker()

    expect(r.resucitados).toBe(1)
    expect(bd.ejecutados).toEqual(['notify'])
    expect(bd.trabajos[0]).toMatchObject({ status: 'done', attempts: 2 })
  })

  it('NO le saca el trabajo a un worker que lo tomó recién', async () => {
    bd.trabajos = [trabajo({ status: 'running', claimed_at: new Date(Date.now() - 5_000).toISOString() })]
    const r = await runFunnelSideEffectsWorker()

    expect(r.resucitados).toBe(0)
    expect(bd.ejecutados).toEqual([])
    expect(bd.trabajos[0].status).toBe('running')
  })
})

describe('dos corridas solapadas', () => {
  it('el mismo trabajo no se ejecuta dos veces: la toma es un UPDATE condicional', async () => {
    bd.trabajos = [trabajo()]
    await Promise.all([runFunnelSideEffectsWorker(), runFunnelSideEffectsWorker()])
    expect(bd.ejecutados).toEqual(['notify'])
  })
})
