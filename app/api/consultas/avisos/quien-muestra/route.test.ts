import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { estado, quienMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', activo: true, logueado: true },
  quienMock: vi.fn(),
}))

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado
    ? { id: 'u1', email: 'x@y.com', profile: { id: 'u1', role: estado.role, is_active: estado.activo } }
    : null),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ cliente: 'falso' })) }))
vi.mock('@/lib/consultas/identificar', () => ({ quienMuestraLaPropiedad: quienMock }))

import { GET } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
const MUESTRA = '44444444-4444-4444-8444-444444444444'
const pedir = (q: string) => GET(new NextRequest(`http://local/api/consultas/avisos/quien-muestra${q}`))

beforeEach(() => {
  quienMock.mockReset()
  quienMock.mockResolvedValue(MUESTRA)
  estado.role = 'coordinador'; estado.activo = true; estado.logueado = true
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave'
})

describe('GET /api/consultas/avisos/quien-muestra', () => {
  it('devuelve quién muestra la propiedad', async () => {
    const res = await pedir(`?propiedad=${PROP}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ muestraId: MUESTRA })
    expect(quienMock).toHaveBeenCalledWith({ cliente: 'falso' }, PROP)
  })

  it('sin nadie: muestraId null', async () => {
    quienMock.mockResolvedValue(null)
    expect(await (await pedir(`?propiedad=${PROP}`)).json()).toEqual({ muestraId: null })
  })

  it.each(['', '?propiedad=', '?propiedad=abc'])('propiedad inválida (%s): 400', async (q) => {
    expect((await pedir(q)).status).toBe(400)
    expect(quienMock).not.toHaveBeenCalled()
  })

  it.each(['asesor', 'abogado'])('%s: 403', async (role) => {
    estado.role = role
    expect((await pedir(`?propiedad=${PROP}`)).status).toBe(403)
    expect(quienMock).not.toHaveBeenCalled()
  })

  it('sin sesión: 401', async () => {
    estado.logueado = false
    expect((await pedir(`?propiedad=${PROP}`)).status).toBe(401)
  })

  it('error de la base: 500 en castellano', async () => {
    quienMock.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await pedir(`?propiedad=${PROP}`)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos ver quién muestra la propiedad')
  })
})
