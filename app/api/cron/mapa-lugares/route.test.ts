/**
 * La puerta de la actualización mensual del mapa: autorización DUAL (env o
 * cron_config), igual que las demás rutas de cron. Validar contra uno solo deja
 * el job en 403 en silencio para siempre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const estado = vi.hoisted(() => ({ secretoEnLaBase: 'secreto-de-la-base' as string | null, corridas: 0 }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            estado.secretoEnLaBase === null ? { data: null, error: null } : { data: { value: estado.secretoEnLaBase }, error: null },
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/mapa/refresco-worker', () => ({
  correrActualizacionMensual: async () => {
    estado.corridas += 1
    return { ok: true, nada: false, celda: '-34.650_-58.450', filas: 1200, ms: 9000 }
  },
}))

import { POST, GET } from './route'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pedido = (secreto?: string, url = 'https://app.test/api/cron/mapa-lugares') => new Request(url, { method: 'POST', headers: secreto ? { 'x-cron-secret': secreto } : {} }) as any

beforeEach(() => {
  estado.secretoEnLaBase = 'secreto-de-la-base'
  estado.corridas = 0
  delete process.env.CRON_SECRET
})

describe('ruta de la actualización mensual del mapa', () => {
  it('ping responde sin auth y sin correr nada', async () => {
    const r = await GET(pedido(undefined, 'https://app.test/api/cron/mapa-lugares?ping=1'))
    expect(await r.json()).toEqual({ ok: true, route: 'mapa-lugares', auth: 'db+env' })
    expect(estado.corridas).toBe(0)
  })
  it('sin secreto: 403', async () => {
    expect((await POST(pedido())).status).toBe(403)
    expect(estado.corridas).toBe(0)
  })
  it('acepta el secreto de la variable de entorno', async () => {
    process.env.CRON_SECRET = 'secreto-de-netlify'
    const r = await POST(pedido('secreto-de-netlify'))
    expect(r.status).toBe(200)
    expect(estado.corridas).toBe(1)
  })
  it('acepta el de cron_config aunque la variable de entorno exista y sea otra', async () => {
    process.env.CRON_SECRET = 'secreto-de-netlify'
    expect((await POST(pedido('secreto-de-la-base'))).status).toBe(200)
  })
  it('un secreto equivocado: 403', async () => {
    expect((await POST(pedido('cualquiera'))).status).toBe(403)
  })
})
