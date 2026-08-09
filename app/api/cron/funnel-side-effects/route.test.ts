/**
 * Tests de la puerta del worker.
 *
 * En este proyecto conviven DOS secretos de cron (uno como variable de entorno
 * en Netlify y otro en la tabla `cron_config`). Validar contra uno solo deja al
 * job devolviendo 403 en silencio para siempre: el worker parece programado,
 * `cron.job_run_details` dice 'succeeded' —pg_net es fire-and-forget— y los
 * avisos de los leads no salen nunca. Por eso la autorización es DUAL, y por eso
 * se testea.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const estado = vi.hoisted(() => ({
  secretoEnLaBase: 'secreto-de-la-base' as string | null,
  corridas: 0,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            estado.secretoEnLaBase === null
              ? { data: null, error: null }
              : { data: { value: estado.secretoEnLaBase }, error: null },
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/funnel/side-effects-worker', () => ({
  runFunnelSideEffectsWorker: async () => {
    estado.corridas += 1
    return { ok: true, resucitados: 0, hechos: 2, salteados: 1, reintentar: 0, fallados: 0, truncada: false }
  },
}))

import { POST, GET } from './route'

function pedido(secreto?: string) {
  return new Request('https://app.test/api/cron/funnel-side-effects', {
    method: 'POST',
    headers: secreto ? { 'x-cron-secret': secreto } : {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
}

beforeEach(() => {
  estado.secretoEnLaBase = 'secreto-de-la-base'
  estado.corridas = 0
  delete process.env.CRON_SECRET
})

describe('autorización dual', () => {
  it('acepta el secreto de la variable de entorno', async () => {
    process.env.CRON_SECRET = 'secreto-de-netlify'
    const res = await POST(pedido('secreto-de-netlify'))
    expect(res.status).toBe(200)
    expect(estado.corridas).toBe(1)
  })

  it('acepta el secreto guardado en cron_config aunque la variable de entorno exista y sea otra', async () => {
    process.env.CRON_SECRET = 'secreto-de-netlify'
    const res = await POST(pedido('secreto-de-la-base'))
    expect(res.status).toBe(200)
    expect(estado.corridas).toBe(1)
  })

  it('sin variable de entorno, el de la base alcanza', async () => {
    const res = await POST(pedido('secreto-de-la-base'))
    expect(res.status).toBe(200)
  })

  it('rechaza un secreto que no es ninguno de los dos', async () => {
    process.env.CRON_SECRET = 'secreto-de-netlify'
    const res = await POST(pedido('cualquier-cosa'))
    expect(res.status).toBe(403)
    expect(estado.corridas).toBe(0)
  })

  it('rechaza cuando no viene secreto', async () => {
    const res = await POST(pedido())
    expect(res.status).toBe(403)
    expect(estado.corridas).toBe(0)
  })
})

describe('ping', () => {
  it('confirma que este deploy tiene la ruta, sin auth y sin efectos', async () => {
    const res = await GET(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new Request('https://app.test/api/cron/funnel-side-effects?ping=1') as any,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, route: 'funnel-side-effects', auth: 'db+env' })
    expect(estado.corridas).toBe(0)
  })
})

describe('respuesta', () => {
  it('devuelve el resumen de la corrida', async () => {
    process.env.CRON_SECRET = 'secreto-de-netlify'
    const json = await (await POST(pedido('secreto-de-netlify'))).json()
    expect(json).toMatchObject({ ok: true, hechos: 2, salteados: 1, fallados: 0 })
    expect(json.firedAt).toBeTruthy()
  })
})
