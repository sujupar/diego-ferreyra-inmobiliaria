import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { estado, identificarMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador' },
  identificarMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'u1', profile: { role: estado.role } })),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ cliente: 'falso' })) }))
vi.mock('@/lib/consultas/identificar', () => ({ identificarAviso: identificarMock }))

import { POST } from './route'

const ASESOR = '22222222-2222-4222-8222-222222222222'
const cuerpo = { portal: 'zonaprop', externalCode: 'ZP123', address: 'Doblas 248', assignedTo: ASESOR, externalUrl: '' }

function pedir(body: unknown) {
  return POST(new NextRequest('http://local/api/portal-inquiries/identify', { method: 'POST', body: JSON.stringify(body) }))
}

beforeEach(() => {
  identificarMock.mockReset()
  identificarMock.mockResolvedValue({ mapId: 'm1', actualizadas: 4 })
  estado.role = 'coordinador'
})

describe('POST /api/portal-inquiries/identify', () => {
  it('responde { updatedInquiries } igual que antes y delega en identificarAviso', async () => {
    const res = await pedir(cuerpo)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updatedInquiries: 4 })
    expect(identificarMock).toHaveBeenCalledWith({ cliente: 'falso' }, {
      portal: 'zonaprop', externalCode: 'ZP123', address: 'Doblas 248', assignedTo: ASESOR,
      propertyId: null, externalUrl: '',
    })
  })

  it('asesor: 403', async () => {
    estado.role = 'asesor'
    expect((await pedir(cuerpo)).status).toBe(403)
    expect(identificarMock).not.toHaveBeenCalled()
  })

  it('datos inválidos: 400', async () => {
    expect((await pedir({ ...cuerpo, address: 'x' })).status).toBe(400)
  })

  it('si la base falla: 500', async () => {
    identificarMock.mockRejectedValue(new Error('se cayó'))
    expect((await pedir(cuerpo)).status).toBe(500)
  })
})
