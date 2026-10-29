import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { estado, conectarMock, avisosMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', activo: true, logueado: true },
  conectarMock: vi.fn(),
  avisosMock: vi.fn(),
}))

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado
    ? { id: 'u1', email: 'x@y.com', profile: { id: 'u1', role: estado.role, is_active: estado.activo } }
    : null),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ cliente: 'falso' })) }))
vi.mock('@/lib/consultas/avisos-datos', () => ({ avisosSinPropiedad: avisosMock }))
vi.mock('@/lib/consultas/identificar', async () => {
  const real = await vi.importActual<typeof import('@/lib/consultas/identificar')>('@/lib/consultas/identificar')
  return { ...real, conectarAviso: conectarMock }
})

import { GET, POST } from './route'
import { ConsultaNoConectable } from '@/lib/consultas/identificar'

const PROP = '33333333-3333-4333-8333-333333333333'

function pedirPost(body: unknown) {
  return POST(new NextRequest('http://local/api/consultas/avisos', { method: 'POST', body: JSON.stringify(body) }))
}

beforeEach(() => {
  conectarMock.mockReset(); avisosMock.mockReset()
  conectarMock.mockResolvedValue({ actualizadas: 26, recordado: true })
  avisosMock.mockResolvedValue({ avisos: [{ portal: 'zonaprop', codigo: '2DLPOM', titulo: 'X', url: null, n: 26, ultima: '2026-10-28T10:00:00Z' }], sueltas: 3 })
  estado.role = 'coordinador'; estado.activo = true; estado.logueado = true
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave'
})

describe('GET /api/consultas/avisos', () => {
  it('coordinador: la lista de avisos', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).avisos[0]).toMatchObject({ codigo: '2DLPOM', n: 26 })
  })

  it.each(['asesor', 'abogado'])('%s: 403 y no lee nada', async (role) => {
    estado.role = role
    expect((await GET()).status).toBe(403)
    expect(avisosMock).not.toHaveBeenCalled()
  })

  it('sin sesión: 401', async () => {
    estado.logueado = false
    expect((await GET()).status).toBe(401)
  })
})

describe('POST /api/consultas/avisos', () => {
  it('conecta el aviso entero con el código TAL CUAL llegó', async () => {
    const res = await pedirPost({ portal: 'zonaprop', codigo: '2DLPOM', propertyId: PROP })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ actualizadas: 26, recordado: true })
    expect(conectarMock).toHaveBeenCalledWith({ cliente: 'falso' }, { portal: 'zonaprop', codigo: '2DLPOM', propertyId: PROP })
  })

  it.each(['admin', 'dueno'])('%s también puede', async (role) => {
    estado.role = role
    expect((await pedirPost({ portal: 'zonaprop', codigo: '2DLPOM', propertyId: PROP })).status).toBe(200)
  })

  it.each(['asesor', 'abogado', 'inventado'])('%s: 403 y no toca la base', async (role) => {
    estado.role = role
    expect((await pedirPost({ portal: 'zonaprop', codigo: '2DLPOM', propertyId: PROP })).status).toBe(403)
    expect(conectarMock).not.toHaveBeenCalled()
  })

  it('cuerpo inválido: 400', async () => {
    expect((await pedirPost({ portal: 'zonaprop', codigo: '', propertyId: PROP })).status).toBe(400)
    expect((await pedirPost({ portal: 'zonaprop', codigo: 'X', propertyId: 'no-uuid' })).status).toBe(400)
    expect(conectarMock).not.toHaveBeenCalled()
  })

  it('un código que no agrupa: el 400 del módulo llega tal cual', async () => {
    conectarMock.mockRejectedValue(new ConsultaNoConectable(400, 'Ese código no identifica un aviso: conectá esas consultas de a una'))
    const res = await pedirPost({ portal: 'zonaprop', codigo: 'https', propertyId: PROP })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no identifica un aviso/)
  })

  it('error de la base: 500 en castellano', async () => {
    conectarMock.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await pedirPost({ portal: 'zonaprop', codigo: '2DLPOM', propertyId: PROP })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos conectar el aviso con la propiedad')
  })
})
