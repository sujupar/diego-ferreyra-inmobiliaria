import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { estado, conectarMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', activo: true, logueado: true },
  conectarMock: vi.fn(),
}))

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado
    ? { id: 'u1', email: 'x@y.com', profile: { id: 'u1', role: estado.role, is_active: estado.activo } }
    : null),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ cliente: 'falso' })) }))
vi.mock('@/lib/consultas/identificar', async () => {
  const real = await vi.importActual<typeof import('@/lib/consultas/identificar')>('@/lib/consultas/identificar')
  return { ...real, conectarConsulta: conectarMock }
})

import { POST } from './route'
import { ConsultaNoConectable } from '@/lib/consultas/identificar'

const CONSULTA = '66666666-6666-4666-8666-666666666666'
const PROP = '33333333-3333-4333-8333-333333333333'

function pedir(id: string, body: unknown) {
  const req = new NextRequest(`http://local/api/consultas/${id}/propiedad`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return POST(req, { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  conectarMock.mockReset()
  conectarMock.mockResolvedValue({ actualizadas: 3, recordado: true })
  estado.role = 'coordinador'; estado.activo = true; estado.logueado = true
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave'
})

describe('POST /api/consultas/[id]/propiedad', () => {
  it('coordinador: 200 con lo que devolvió conectarConsulta', async () => {
    const res = await pedir(CONSULTA, { propertyId: PROP, recordar: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ actualizadas: 3, recordado: true })
    expect(conectarMock).toHaveBeenCalledWith({ cliente: 'falso' }, { consultaId: CONSULTA, propertyId: PROP, recordar: true })
  })

  it.each(['admin', 'dueno'])('%s también puede', async (role) => {
    estado.role = role
    expect((await pedir(CONSULTA, { propertyId: PROP, recordar: false })).status).toBe(200)
  })

  it.each(['asesor', 'abogado', 'inventado'])('%s: 403 y no toca la base', async (role) => {
    estado.role = role
    expect((await pedir(CONSULTA, { propertyId: PROP, recordar: true })).status).toBe(403)
    expect(conectarMock).not.toHaveBeenCalled()
  })

  it('sin sesión o inactivo: 401', async () => {
    estado.logueado = false
    expect((await pedir(CONSULTA, { propertyId: PROP, recordar: true })).status).toBe(401)
    estado.logueado = true; estado.activo = false
    expect((await pedir(CONSULTA, { propertyId: PROP, recordar: true })).status).toBe(401)
    expect(conectarMock).not.toHaveBeenCalled()
  })

  it('id que no es uuid: 400', async () => {
    expect((await pedir('abc', { propertyId: PROP, recordar: true })).status).toBe(400)
    expect(conectarMock).not.toHaveBeenCalled()
  })

  it.each([
    ['sin propertyId', { recordar: true }],
    ['propertyId no uuid', { propertyId: 'x', recordar: true }],
    ['recordar no booleano', { propertyId: PROP, recordar: 'si' }],
    ['sin recordar', { propertyId: PROP }],
  ])('cuerpo inválido (%s): 400', async (_n, body) => {
    expect((await pedir(CONSULTA, body)).status).toBe(400)
    expect(conectarMock).not.toHaveBeenCalled()
  })

  it('cuerpo que no es JSON: 400', async () => {
    expect((await pedir(CONSULTA, '{roto')).status).toBe(400)
  })

  it('consulta o propiedad inexistente: 404 con el mensaje', async () => {
    conectarMock.mockRejectedValue(new ConsultaNoConectable(404, 'No encontramos la consulta'))
    const res = await pedir(CONSULTA, { propertyId: PROP, recordar: true })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('No encontramos la consulta')
  })

  it('consulta de landing: 400 con el mensaje', async () => {
    conectarMock.mockRejectedValue(new ConsultaNoConectable(400, 'Esta consulta ya tiene propiedad'))
    const res = await pedir(CONSULTA, { propertyId: PROP, recordar: true })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Esta consulta ya tiene propiedad')
  })

  it('error de la base: 500 en castellano, sin el detalle técnico', async () => {
    conectarMock.mockRejectedValue(new Error('connection reset'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await pedir(CONSULTA, { propertyId: PROP, recordar: true })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos conectar la consulta con la propiedad')
  })
})
