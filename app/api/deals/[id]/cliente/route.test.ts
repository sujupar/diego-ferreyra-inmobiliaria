/**
 * Completar los datos del cliente de un proceso, en un solo pedido. Es lo que
 * guarda la ventana "Completá los datos del cliente para avanzar".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Contacto = { id: string; full_name: string | null; phone: string | null; email: string | null }

const { estado } = vi.hoisted(() => ({
  estado: {
    usuario: { id: 'admin-1', profile: { id: 'admin-1', role: 'admin' } },
    acceso: true,
    asignable: true,
    deal: null as null | { id: string; contact_id: string | null; property_address: string; assigned_to: string | null; origin: string | null },
    contactos: {} as Record<string, Contacto>,
    encontrado: null as null | Contacto,
    escrituras: [] as { tabla: string; id: string; valores: Record<string, unknown> }[],
    faltanDespues: [] as string[],
    // crm-ficha-y-llamadas, tarea 5.5
    veiaElContacto: true,
    notaFalla: false,
    updateDealsError: null as null | { message: string },
    orden: [] as string[],
  },
}))

vi.mock('@/lib/auth/require-role', () => ({ requireAuth: vi.fn(async () => estado.usuario) }))
vi.mock('@/lib/auth/entity-access', () => ({
  canAccessDeal: vi.fn(async () => estado.acceso),
  canAccessContact: vi.fn(async () => { estado.orden.push('canAccessContact'); return estado.veiaElContacto }),
}))
vi.mock('@/lib/deals/asesor-asignable', () => ({ esAsesorAsignable: vi.fn(async () => estado.asignable) }))
vi.mock('@/lib/supabase/contactos', () => ({
  encontrarOCrearContacto: vi.fn(async () => {
    const c = estado.encontrado!
    estado.contactos[c.id] = c
    return c.id
  }),
  registrarNotaDeVinculo: vi.fn(async () => {
    estado.orden.push('nota')
    if (estado.notaFalla) throw new Error('insert falló')
  }),
}))
vi.mock('@/lib/deals/datos-cliente', () => ({
  leerDatosDelProceso: vi.fn(async () => ({ stage: 'scheduled', faltan: estado.faltanDespues })),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      let valor: string | null = null
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (_c: string, v: string) => { valor = v; return q }
      q.maybeSingle = async () => ({
        data: tabla === 'deals' ? estado.deal : (valor ? estado.contactos[valor] ?? null : null),
        error: null,
      })
      q.update = (valores: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          estado.orden.push(`update:${tabla}`)
          if (tabla === 'deals' && estado.updateDealsError) return { error: estado.updateDealsError }
          estado.escrituras.push({ tabla, id, valores })
          return { error: null }
        },
      })
      return q
    },
  }),
}))

import { PUT } from './route'
import { NextRequest } from 'next/server'

const params = Promise.resolve({ id: 'deal-1' })
const pedido = (body: unknown) => new NextRequest('http://local/api/deals/deal-1/cliente', {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
const datos = { nombre: 'Marta Gómez', telefono: '11 5555-4444', email: 'Marta@Example.com' }
const escriturasDe = (tabla: string) => estado.escrituras.filter(e => e.tabla === tabla)

beforeEach(() => {
  estado.usuario = { id: 'admin-1', profile: { id: 'admin-1', role: 'admin' } }
  estado.acceso = true
  estado.asignable = true
  estado.deal = { id: 'deal-1', contact_id: 'c-falso', property_address: 'Formosa 5176, CABA', assigned_to: 'asesor-1', origin: 'historico' }
  estado.contactos = { 'c-falso': { id: 'c-falso', full_name: 'Formosa 5176', phone: null, email: null } }
  estado.encontrado = null
  estado.escrituras = []
  estado.faltanDespues = []
  estado.veiaElContacto = true
  estado.notaFalla = false
  estado.updateDealsError = null
  estado.orden = []
  vi.clearAllMocks()
})

describe('PUT /api/deals/[id]/cliente', () => {
  it('corrige el contacto del proceso con lo que cargó el asesor', async () => {
    const res = await PUT(pedido(datos), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, contactId: 'c-falso', faltan: [] })
    expect(escriturasDe('contacts')).toEqual([
      { tabla: 'contacts', id: 'c-falso', valores: expect.objectContaining({ full_name: 'Marta Gómez', phone: '11 5555-4444', email: 'marta@example.com' }) },
    ])
  })

  it('con datos inválidos no escribe nada y dice todo lo que está mal', async () => {
    const res = await PUT(pedido({ nombre: 'Formosa 5176', telefono: '123', email: '' }), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).errores).toHaveLength(3)
    expect(estado.escrituras).toEqual([])
  })

  it('sin contacto: busca a la persona y, si existe, NO le pisa los datos buenos', async () => {
    estado.deal!.contact_id = null
    estado.encontrado = { id: 'c-real', full_name: 'Marta G.', phone: '1155554444', email: 'otra@example.com' }
    const res = await PUT(pedido(datos), { params })
    expect(res.status).toBe(200)
    // Tenía nombre, teléfono y email válidos: no se toca nada del contacto.
    expect(escriturasDe('contacts')).toEqual([])
    expect(escriturasDe('deals')).toEqual([{ tabla: 'deals', id: 'deal-1', valores: expect.objectContaining({ contact_id: 'c-real' }) }])
  })

  it('sin contacto, y el encontrado tiene huecos: completa SOLO los huecos', async () => {
    estado.deal!.contact_id = null
    estado.encontrado = { id: 'c-real', full_name: 'Marta G.', phone: '1155554444', email: null }
    await PUT(pedido(datos), { params })
    expect(escriturasDe('contacts')).toEqual([{ tabla: 'contacts', id: 'c-real', valores: expect.objectContaining({ email: 'marta@example.com' }) }])
    expect(escriturasDe('contacts')[0].valores).not.toHaveProperty('full_name')
  })

  it('un proceso sin asesor exige elegirlo', async () => {
    estado.deal!.assigned_to = null
    const res = await PUT(pedido(datos), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/asesor/i)
    expect(estado.escrituras).toEqual([])
  })

  it('un admin asigna el asesor en el mismo pedido', async () => {
    estado.deal!.assigned_to = null
    const res = await PUT(pedido({ ...datos, asesorId: 'asesor-9' }), { params })
    expect(res.status).toBe(200)
    expect(escriturasDe('deals')[0].valores).toMatchObject({ assigned_to: 'asesor-9' })
  })

  it('a alguien que no puede tener procesos, no', async () => {
    estado.asignable = false
    const res = await PUT(pedido({ ...datos, asesorId: 'abogado-1' }), { params })
    expect(res.status).toBe(400)
    expect(estado.escrituras).toEqual([])
  })

  it('un asesor no puede cambiar el asesor', async () => {
    estado.usuario = { id: 'asesor-1', profile: { id: 'asesor-1', role: 'asesor' } }
    const res = await PUT(pedido({ ...datos, asesorId: 'asesor-9' }), { params })
    expect(res.status).toBe(403)
    expect(estado.escrituras).toEqual([])
  })

  it('un asesor SÍ completa los datos de su propio proceso', async () => {
    estado.usuario = { id: 'asesor-1', profile: { id: 'asesor-1', role: 'asesor' } }
    const res = await PUT(pedido(datos), { params })
    expect(res.status).toBe(200)
  })

  it('sin acceso al proceso, o abogado: 403', async () => {
    estado.acceso = false
    expect((await PUT(pedido(datos), { params })).status).toBe(403)
    estado.acceso = true
    estado.usuario = { id: 'ab-1', profile: { id: 'ab-1', role: 'abogado' } }
    expect((await PUT(pedido(datos), { params })).status).toBe(403)
  })

  it('proceso inexistente: 404', async () => {
    estado.deal = null
    expect((await PUT(pedido(datos), { params })).status).toBe(404)
  })
})

describe('PUT /api/deals/[id]/cliente — rastro al enganchar un contacto ajeno (tarea 5.5)', () => {
  const asesor = () => { estado.usuario = { id: 'asesor-1', profile: { id: 'asesor-1', role: 'asesor' } } }
  const sinContacto = (encontrado: Contacto = { id: 'c-real', full_name: 'Marta G.', phone: '1155554444', email: 'otra@example.com' }) => {
    estado.deal!.contact_id = null
    estado.encontrado = encontrado
  }
  const notaPedida = async () => (await import('@/lib/supabase/contactos')).registrarNotaDeVinculo as unknown as ReturnType<typeof vi.fn>
  const accesoContacto = async () => (await import('@/lib/auth/entity-access')).canAccessContact as unknown as ReturnType<typeof vi.fn>

  it('asesor, proceso sin contacto, contacto que ya existía y no podía ver → 200, vinculado y nota pedida', async () => {
    asesor(); sinContacto(); estado.veiaElContacto = false
    const res = await PUT(pedido(datos), { params })
    expect(res.status).toBe(200)
    expect(escriturasDe('deals')[0].valores).toMatchObject({ contact_id: 'c-real' })
    expect(await notaPedida()).toHaveBeenCalledWith({ contactId: 'c-real', dealId: 'deal-1', autorId: 'asesor-1', direccion: 'Formosa 5176, CABA' })
  })
  it('contacto recién creado → sin nota', async () => {
    asesor(); sinContacto({ id: 'c-nuevo', full_name: 'Marta Gómez', phone: '1155554444', email: 'marta@example.com' }); estado.veiaElContacto = true
    expect((await PUT(pedido(datos), { params })).status).toBe(200)
    expect(await notaPedida()).not.toHaveBeenCalled()
  })
  it('contacto que ya podía ver → sin nota', async () => {
    asesor(); sinContacto(); estado.veiaElContacto = true
    await PUT(pedido(datos), { params })
    expect(await notaPedida()).not.toHaveBeenCalled()
  })
  it('coordinadora → sin nota y no se consulta canAccessContact', async () => {
    estado.usuario = { id: 'coord-1', profile: { id: 'coord-1', role: 'coordinador' } }
    sinContacto(); estado.veiaElContacto = false
    expect((await PUT(pedido(datos), { params })).status).toBe(200)
    expect(await notaPedida()).not.toHaveBeenCalled()
    expect(await accesoContacto()).not.toHaveBeenCalled()
  })
  it('proceso que ya tenía contacto → sin nota y sin consultar', async () => {
    asesor(); estado.veiaElContacto = false
    expect((await PUT(pedido(datos), { params })).status).toBe(200)
    expect(await notaPedida()).not.toHaveBeenCalled()
    expect(await accesoContacto()).not.toHaveBeenCalled()
  })
  it('canAccessContact se consulta ANTES del update de deals, y la nota va después', async () => {
    asesor(); sinContacto(); estado.veiaElContacto = false
    await PUT(pedido(datos), { params })
    const i = (x: string) => estado.orden.indexOf(x)
    expect(i('canAccessContact')).toBeGreaterThanOrEqual(0)
    expect(i('canAccessContact')).toBeLessThan(i('update:deals'))
    expect(i('update:deals')).toBeLessThan(i('nota'))
  })
  it('la nota falla → 200, el vínculo queda y console.error una vez, sin datos de la persona', async () => {
    asesor(); sinContacto(); estado.veiaElContacto = false; estado.notaFalla = true
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await PUT(pedido(datos), { params })
    expect(res.status).toBe(200)
    expect(escriturasDe('deals')[0].valores).toMatchObject({ contact_id: 'c-real' })
    expect(err).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(err.mock.calls[0])).not.toContain('Marta')
    expect(JSON.stringify(err.mock.calls[0])).not.toContain('5555')
    err.mockRestore()
  })
  it('el update del proceso falla → 500 y no se pide la nota', async () => {
    asesor(); sinContacto(); estado.veiaElContacto = false; estado.updateDealsError = { message: 'caída' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await PUT(pedido(datos), { params })).status).toBe(500)
    expect(await notaPedida()).not.toHaveBeenCalled()
    err.mockRestore()
  })
})
