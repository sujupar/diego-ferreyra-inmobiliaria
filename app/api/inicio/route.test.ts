import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ estado: { role: 'asesor', id: 'u-1' }, leerInicio: vi.fn() }))
vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: m.estado.id, profile: { id: m.estado.id, role: m.estado.role, full_name: 'Tomás Agüero' } })),
}))
vi.mock('@/lib/supabase/inicio', () => ({ leerInicio: m.leerInicio }))

import { GET } from './route'

beforeEach(() => {
  m.leerInicio.mockReset()
})

describe('GET /api/inicio', () => {
  it('pide el Inicio de quien está conectado, con su rol', async () => {
    m.leerInicio.mockResolvedValue({ rol: 'asesor', saludo: 'Hola, Tomás', fecha: 'x', bloques: {} })
    const r = await GET()
    expect(r.status).toBe(200)
    expect(m.leerInicio).toHaveBeenCalledWith({ id: 'u-1', role: 'asesor', nombre: 'Tomás Agüero' }, expect.any(Date))
  })
  it('un rol sin Inicio → 403', async () => {
    m.estado.role = 'abogado'
    m.leerInicio.mockResolvedValue(null)
    expect((await GET()).status).toBe(403)
    m.estado.role = 'asesor'
  })
  it('si falla → 500 legible', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.leerInicio.mockRejectedValue(new Error('x'))
    const r = await GET()
    expect(r.status).toBe(500)
    expect((await r.json()).error).toMatch(/Probá de nuevo/)
    err.mockRestore()
  })
})
