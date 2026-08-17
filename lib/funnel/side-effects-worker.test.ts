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
      neq: (c: string, v: unknown) => { filtros.push((f) => f[c] !== v); return q },
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
    if (c === 'limite') throw new Error(`[LIMITE_META] WhatsApp: límite de mensajería (código 131048)`)
    return c === 'skip' ? 'skipped' : 'done'
  },
}))

vi.mock('@/lib/email/notifications/admin-failure-alert', () => ({
  notifyAdminEmailFailure: async (p: { failedNotificationType: string; errors: string[] }) => {
    bd.escalaciones.push({ tipo: p.failedNotificationType, error: p.errors[0] })
  },
}))

import {
  runFunnelSideEffectsWorker,
  PRESUPUESTO_MS,
  PEOR_TRABAJO_MS,
  TECHO_NETLIFY_MS,
} from './side-effects-worker'

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

describe('el WhatsApp del cliente va SIEMPRE primero', () => {
  it('con backlog de avisos internos viejos, el whatsapp nuevo se ejecuta antes', async () => {
    // Tres avisos internos ATRASADOS (más viejos en la cola) y un whatsapp
    // recién encolado. Sin la ventana prioritaria, el orden por antigüedad
    // ponía los tres primero y el cliente esperaba su primer mensaje — el
    // que el formulario promete "en los próximos segundos".
    bd.trabajos = [
      trabajo({ id: 'v1', kind: 'notify', next_attempt_at: '2026-01-01T00:00:01.000Z' }),
      trabajo({ id: 'v2', kind: 'capi', next_attempt_at: '2026-01-01T00:00:02.000Z' }),
      trabajo({ id: 'v3', kind: 'mailchimp', next_attempt_at: '2026-01-01T00:00:03.000Z' }),
      trabajo({ id: 'w1', kind: 'whatsapp', submission_id: 'envio-nuevo', next_attempt_at: '2026-01-01T00:00:09.000Z' }),
    ] as never
    await runFunnelSideEffectsWorker()
    expect(bd.ejecutados[0]).toBe('whatsapp')
  })
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

  it('un límite de volumen de Meta espera HORAS, no segundos', async () => {
    // El tier de WhatsApp recién cede dentro de la ventana de 24 h. La escalera
    // normal (30 s) quemaba los 5 intentos en ~7,6 h contra una pared; con la
    // marca [LIMITE_META], el worker reintenta cada 4 h.
    bd.trabajos = [trabajo({ kind: 'whatsapp' })]
    bd.comportamiento.whatsapp = 'limite'
    await runFunnelSideEffectsWorker()

    const t = bd.trabajos[0]
    expect(t.status).toBe('pending')
    const esperaMs = Date.parse(String(t.next_attempt_at)) - Date.now()
    expect(esperaMs).toBeGreaterThan(3.9 * 3600_000)
    expect(esperaMs).toBeLessThan(4.1 * 3600_000)
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

/**
 * A2 — el agujero que dejaba a un trabajo reintentándose para siempre.
 *
 * El `catch` del bucle era el ÚNICO lugar que escribía 'failed'. Cuando la
 * función de Netlify se muere a mitad, ese `catch` no corre: la fila queda
 * 'running', el reaper la devuelve a 'pending' y se vuelve a tomar. `attempts`
 * crecía sin techo, nunca llegaba a 'failed' y `escalarTrabajoAgotado` no se
 * disparaba jamás.
 */
describe('el trabajo que murió a mitad SIEMPRE termina agotándose y escalando', () => {
  it('un pending con los intentos ya gastados no se ejecuta: queda failed y escala', async () => {
    // Así queda una fila cuyo worker murió tras gastar el último intento y a la
    // que el reaper ya devolvió a la cola.
    bd.trabajos = [trabajo({ attempts: 5, max_attempts: 5, status: 'pending' })]

    const r = await runFunnelSideEffectsWorker()

    expect(bd.ejecutados).toEqual([]) // NO se vuelve a ejecutar
    expect(bd.trabajos[0]).toMatchObject({ status: 'failed', attempts: 5, claimed_at: null })
    expect(r).toMatchObject({ fallados: 1, hechos: 0 })
    expect(bd.escalaciones).toHaveLength(1)
    expect(bd.escalaciones[0].tipo).toBe('embudo:notify')
    expect(bd.escalaciones[0].error).toContain('agotó los 5 intentos')
  })

  it('el ciclo completo: muere a mitad → reaper → se agota → escala (y no da vueltas eterno)', async () => {
    // Así queda la fila cuando el worker la tomó —gastando el 5º y último
    // intento— y se murió ANTES de escribir el resultado: 'running', con
    // claimed_at viejo y el contador ya en el tope. El `catch` nunca corrió.
    bd.trabajos = [
      trabajo({ attempts: 5, max_attempts: 5, status: 'running', claimed_at: new Date(Date.now() - 30 * 60_000).toISOString() }),
    ]

    // Corrida 1: el reaper lo revive y, con los intentos ya agotados, lo cierra.
    const r = await runFunnelSideEffectsWorker()
    expect(r.resucitados).toBe(1)
    expect(bd.ejecutados).toEqual([]) // no se re-ejecuta un trabajo sin intentos
    expect(bd.trabajos[0].status).toBe('failed')
    expect(bd.escalaciones).toHaveLength(1)

    // Corrida 2: ya está cerrado, no vuelve a la rueda ni escala dos veces.
    const r2 = await runFunnelSideEffectsWorker()
    expect(r2).toMatchObject({ resucitados: 0, fallados: 0 })
    expect(bd.ejecutados).toEqual([])
    expect(bd.escalaciones).toHaveLength(1)
    expect(bd.trabajos[0].attempts).toBe(5) // el contador dejó de crecer
  })

  it('con los intentos agotados el aviso a admins lleva el ÚLTIMO error conocido, no un texto genérico', async () => {
    bd.trabajos = [trabajo({ attempts: 5, max_attempts: 5, last_error: 'Tiempo de espera agotado: Resend no respondió' })]
    await runFunnelSideEffectsWorker()
    expect(bd.escalaciones[0].error).toContain('Resend no respondió')
  })

  it('cerrar a los agotados no frena a los trabajos que SÍ tienen intentos', async () => {
    bd.trabajos = [
      trabajo({ id: 'agotado', kind: 'capi', attempts: 5, max_attempts: 5 }),
      trabajo({ id: 'sano', kind: 'notify', attempts: 1, max_attempts: 5 }),
    ]
    const r = await runFunnelSideEffectsWorker()

    expect(bd.ejecutados).toEqual(['notify'])
    const porId = Object.fromEntries(bd.trabajos.map(t => [t.id, t.status]))
    expect(porId).toEqual({ agotado: 'failed', sano: 'done' })
    expect(r).toMatchObject({ hechos: 1, fallados: 1 })
  })
})

/**
 * A3 — el presupuesto de tiempo. El chequeo va ANTES de tomar el trabajo, así
 * que una corrida dura, como máximo, el presupuesto MÁS lo que tarde el trabajo
 * que arrancó justo en el límite.
 */
describe('presupuesto de tiempo', () => {
  it('cierra con el peor trabajo dentro del techo de la función', () => {
    // Si alguien vuelve a subir el presupuesto, o si el aviso pasa a tener un
    // destinatario más (PEOR_TRABAJO_MS sube), esta cuenta deja de cerrar y hay
    // que rehacerla — no descubrirlo con un 504 en producción.
    expect(PRESUPUESTO_MS + PEOR_TRABAJO_MS).toBeLessThanOrEqual(TECHO_NETLIFY_MS)
    expect(PRESUPUESTO_MS).toBeGreaterThan(0)
  })

  it('agotado el presupuesto no se toma NINGÚN trabajo más y la corrida se declara truncada', async () => {
    bd.trabajos = CINCO.map((kind, i) => trabajo({ id: `j${i}`, kind }))
    // Presupuesto 0: el chequeo corta antes del primer trabajo.
    const r = await runFunnelSideEffectsWorker({ presupuestoMs: 0 })

    expect(bd.ejecutados).toEqual([])
    expect(r.truncada).toBe(true)
    expect(bd.trabajos.every(t => t.status === 'pending')).toBe(true)
  })

  it('cerrar a un agotado también gasta presupuesto (escalar manda un email): sin presupuesto queda para el tick siguiente', async () => {
    bd.trabajos = [trabajo({ attempts: 5, max_attempts: 5 })]

    const r = await runFunnelSideEffectsWorker({ presupuestoMs: 0 })
    expect(bd.trabajos[0].status).toBe('pending') // sigue en la cola, no se pierde
    expect(bd.escalaciones).toEqual([])
    expect(r).toMatchObject({ fallados: 0, truncada: true })

    // Con presupuesto normal, el tick siguiente lo cierra y escala.
    const r2 = await runFunnelSideEffectsWorker()
    expect(bd.trabajos[0].status).toBe('failed')
    expect(r2.fallados).toBe(1)
    expect(bd.escalaciones).toHaveLength(1)
  })
})

/**
 * A5 — la IP en claro. El payload del trabajo `capi` lleva la IP sin hashear
 * (Meta la pide así). Hasta esta cola, la IP en claro NO existía en la base:
 * `funnel_lead_submissions` guarda solo `ip_hash`. Como las filas terminadas no
 * se borran, cada lead dejaba una fila con la IP para siempre.
 */
describe('el payload no sobrevive al trabajo', () => {
  const PAYLOAD_CAPI = { funnel: 'tasacion', eventId: 'evt-1', ip: '200.10.20.30', userAgent: 'Mozilla/5.0', email: 'ana@ejemplo.com' }

  it('al terminar en done el payload queda vacío', async () => {
    bd.trabajos = [trabajo({ kind: 'capi', payload: PAYLOAD_CAPI })]
    await runFunnelSideEffectsWorker()

    expect(bd.trabajos[0].status).toBe('done')
    expect(bd.trabajos[0].payload).toEqual({})
    expect(JSON.stringify(bd.trabajos[0])).not.toContain('200.10.20.30')
  })

  it('al terminar en skipped también (un skipped es final: no se reintenta)', async () => {
    bd.trabajos = [trabajo({ kind: 'capi', payload: PAYLOAD_CAPI })]
    bd.comportamiento.capi = 'skip'
    await runFunnelSideEffectsWorker()

    expect(bd.trabajos[0].status).toBe('skipped')
    expect(bd.trabajos[0].payload).toEqual({})
  })

  it('un trabajo que va a reintentarse CONSERVA el payload (sin él, el reintento no puede correr)', async () => {
    bd.trabajos = [trabajo({ kind: 'capi', payload: PAYLOAD_CAPI })]
    bd.comportamiento.capi = 'explota'
    await runFunnelSideEffectsWorker()

    expect(bd.trabajos[0].status).toBe('pending')
    expect(bd.trabajos[0].payload).toEqual(PAYLOAD_CAPI)
  })
})
