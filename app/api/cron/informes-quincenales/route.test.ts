import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const correrCiclo = vi.fn()
vi.mock('@/lib/informes/ciclo-servicio', () => ({ correrCiclo: (...a: unknown[]) => correrCiclo(...a) }))
vi.mock('@/lib/informes/ciclo-real', () => ({ dependenciasReales: () => ({}) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
}))

import { GET, POST } from './route'

const URL_BASE = 'https://inmodf.com.ar/api/cron/informes-quincenales'
const pedido = (q = '', secreto?: string) => new NextRequest(`${URL_BASE}${q}`, { method: 'POST', headers: secreto ? { 'x-cron-secret': secreto } : {} })

beforeEach(() => {
  correrCiclo.mockReset()
  process.env.CRON_SECRET = 'secreto-de-prueba-largo'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave'
})

describe('/api/cron/informes-quincenales', () => {
  it('?ping=1 responde sin secreto (lo usa el script que programa el job para verificar el deploy)', async () => {
    const r = await GET(new NextRequest(`${URL_BASE}?ping=1`))
    expect(await r.json()).toEqual({ ok: true, route: 'informes-quincenales', auth: 'db+env' })
  })

  it('sin secreto o con uno equivocado: 403 y no corre nada', async () => {
    expect((await POST(pedido())).status).toBe(403)
    expect((await POST(pedido('', 'otro'))).status).toBe(403)
    expect(correrCiclo).not.toHaveBeenCalled()
  })

  it('una propiedad que no es un id válido: 400', async () => {
    expect((await POST(pedido('?propiedad=1%3Bdrop', 'secreto-de-prueba-largo'))).status).toBe(400)
    expect(correrCiclo).not.toHaveBeenCalled()
  })

  it('con el secreto corre el ciclo con las propiedades pedidas y devuelve lo que hizo', async () => {
    correrCiclo.mockResolvedValue({ hoy: '2026-11-01', motivo: 'faltan_fuentes', creados: 3, fuentes: 4, errores: [], avisados: 0, email: null, periodo: null })
    const id = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
    const r = await POST(pedido(`?propiedad=${id}`, 'secreto-de-prueba-largo'))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, creados: 3, fuentes: 4 })
    expect(correrCiclo.mock.calls[0][2]).toEqual({ propiedades: [id] })
  })

  it('si la corrida revienta, 500 con el motivo (el job lo deja en net._http_response)', async () => {
    correrCiclo.mockRejectedValue(new Error('base caída'))
    const r = await POST(pedido('', 'secreto-de-prueba-largo'))
    expect(r.status).toBe(500)
    expect(await r.json()).toMatchObject({ ok: false, error: 'base caída' })
  })
})
