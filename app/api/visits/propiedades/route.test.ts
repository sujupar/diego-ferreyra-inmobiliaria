import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { estado, datosMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', id: '22222222-2222-4222-8222-222222222222' },
  datosMock: { buscarPropiedadesParaVisita: vi.fn() },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: estado.id, email: 'a@b.c', profile: { id: estado.id, role: estado.role, is_active: true } })),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)

import { GET } from './route'

function pedir(qs: Record<string, string>) {
  const sp = new URLSearchParams(qs)
  return GET(new NextRequest(`http://local/api/visits/propiedades?${sp.toString()}`))
}

beforeEach(() => {
  datosMock.buscarPropiedadesParaVisita.mockReset()
  datosMock.buscarPropiedadesParaVisita.mockResolvedValue([])
  estado.role = 'coordinador'
})

describe('GET /api/visits/propiedades — límite', () => {
  it('sin `limite`: 20, como siempre (la ventana de visitas no cambia)', async () => {
    expect((await pedir({ q: '' })).status).toBe(200)
    expect(datosMock.buscarPropiedadesParaVisita).toHaveBeenCalledWith(expect.objectContaining({ limite: 20 }))
  })
  it('con `limite=200`: pide hasta 200 (Consultas ordena el inventario entero por barrio)', async () => {
    await pedir({ q: '', limite: '200' })
    expect(datosMock.buscarPropiedadesParaVisita).toHaveBeenCalledWith(expect.objectContaining({ limite: 200 }))
  })
  it.each(['0', '201', '1.5', 'abc', '-3'])('`limite=%s` inválido: 400 y no busca', async (v) => {
    expect((await pedir({ limite: v })).status).toBe(400)
    expect(datosMock.buscarPropiedadesParaVisita).not.toHaveBeenCalled()
  })
  it('el asesor sigue viendo solo las suyas con cualquier límite', async () => {
    estado.role = 'asesor'
    await pedir({ limite: '200' })
    expect(datosMock.buscarPropiedadesParaVisita).toHaveBeenCalledWith(expect.objectContaining({ asesorId: estado.id, limite: 200 }))
  })
})
