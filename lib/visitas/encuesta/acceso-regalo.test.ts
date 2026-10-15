import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, mediaMock } = vi.hoisted(() => ({
  estado: { logueado: true, role: 'asesor', activo: true },
  mediaMock: vi.fn(),
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado ? { id: 'u1', email: 'a@b.c', profile: { id: 'u1', role: estado.role, is_active: estado.activo } } : null),
}))
vi.mock('@/lib/properties/acceso-media', () => ({ puedeGestionarMedia: mediaMock }))

import { autorizarRegalo } from './acceso-regalo'

const PROP = '33333333-3333-4333-8333-333333333333'
beforeEach(() => { estado.logueado = true; estado.role = 'asesor'; estado.activo = true; mediaMock.mockReset().mockResolvedValue(true) })

describe('autorizarRegalo', () => {
  it('quien gestiona el material de la propiedad, sí', async () => {
    expect(await autorizarRegalo(PROP)).toEqual({ ok: true, userId: 'u1' })
  })
  it('sin sesión 401; inactivo 401; abogado 403 sin consultar; ajena 403; id inventado 404', async () => {
    estado.logueado = false
    expect((await autorizarRegalo(PROP)).ok).toBe(false)
    estado.logueado = true; estado.activo = false
    expect(await autorizarRegalo(PROP)).toMatchObject({ status: 401 })
    estado.activo = true; estado.role = 'abogado'
    expect(await autorizarRegalo(PROP)).toMatchObject({ status: 403 })
    expect(mediaMock).not.toHaveBeenCalled()
    estado.role = 'asesor'; mediaMock.mockResolvedValue(false)
    expect(await autorizarRegalo(PROP)).toMatchObject({ status: 403, error: 'Solo quien gestiona la propiedad puede cargar el regalo' })
    expect(await autorizarRegalo('x')).toMatchObject({ status: 404 })
  })
})
