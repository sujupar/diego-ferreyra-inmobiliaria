import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { estado, datosMock } = vi.hoisted(() => ({
  estado: { role: 'asesor', id: '22222222-2222-4222-8222-222222222222' },
  datosMock: { leerPropiedadParaVisita: vi.fn(), visitasDelDia: vi.fn() },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: estado.id, email: 'a@b.c', profile: { id: estado.id, role: estado.role, is_active: true } })),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)

import { GET } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
const OTRO_ASESOR = '77777777-7777-4777-8777-777777777777'

function pedir(qs: Record<string, string>) {
  const sp = new URLSearchParams(qs)
  return GET(new NextRequest(`http://local/api/visits/agenda-del-asesor?${sp.toString()}`))
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  estado.role = 'asesor'; estado.id = '22222222-2222-4222-8222-222222222222'
  datosMock.leerPropiedadParaVisita.mockResolvedValue({ id: PROP, assigned_to: estado.id })
  datosMock.visitasDelDia.mockResolvedValue([])
})

describe('GET /api/visits/agenda-del-asesor', () => {
  it('abogado: 403', async () => {
    estado.role = 'abogado'
    expect((await pedir({ fecha: '2026-10-12', propiedad: PROP })).status).toBe(403)
  })
  it('fecha imposible (31 de febrero): 400', async () => {
    const res = await pedir({ fecha: '2026-02-31', propiedad: PROP })
    expect(res.status).toBe(400)
    expect(datosMock.visitasDelDia).not.toHaveBeenCalled()
  })
  it('un asesor con una propiedad ajena: 404', async () => {
    datosMock.leerPropiedadParaVisita.mockResolvedValue({ id: PROP, assigned_to: 'otro' })
    const res = await pedir({ fecha: '2026-10-12', propiedad: PROP })
    expect(res.status).toBe(404)
    expect(datosMock.visitasDelDia).not.toHaveBeenCalled()
  })
  it('un asesor con la propiedad inexistente: 404', async () => {
    datosMock.leerPropiedadParaVisita.mockResolvedValue(null)
    expect((await pedir({ fecha: '2026-10-12', propiedad: PROP })).status).toBe(404)
  })
  it('un asesor que manda asesor=<otro>: se usa su propio id, no el pedido', async () => {
    const res = await pedir({ fecha: '2026-10-12', propiedad: PROP, asesor: OTRO_ASESOR })
    expect(res.status).toBe(200)
    expect(datosMock.visitasDelDia).toHaveBeenCalledWith({ fecha: '2026-10-12', asesorId: estado.id, propiedadId: PROP })
  })
  it('coordinador: no necesita que la propiedad sea suya y puede pedir otro asesor', async () => {
    estado.role = 'coordinador'
    datosMock.leerPropiedadParaVisita.mockResolvedValue({ id: PROP, assigned_to: 'otro' })
    const res = await pedir({ fecha: '2026-10-12', propiedad: PROP, asesor: OTRO_ASESOR })
    expect(res.status).toBe(200)
    expect(datosMock.leerPropiedadParaVisita).not.toHaveBeenCalled()
    expect(datosMock.visitasDelDia).toHaveBeenCalledWith({ fecha: '2026-10-12', asesorId: OTRO_ASESOR, propiedadId: PROP })
  })
})
