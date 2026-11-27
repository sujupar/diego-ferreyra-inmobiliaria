/**
 * POST /api/deals con `contact_id` (crm-ficha-y-llamadas, tarea 8.2; design.md D9):
 * coordinar a una persona que no tiene solicitud (el lead de la clase gratuita, o un
 * contacto sin proceso activo). Crea un proceso NUEVO como hoy, pero con ese contacto,
 * sin buscar otro por email ni teléfono, y después le guarda los datos validados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  usuario: { id: 'coord-1', email: 'c@x.com', profile: { id: 'coord-1', role: 'coordinador' as string } },
  orden: [] as string[],
  consultasDirectas: [] as string[],
  contactosCreados: [] as Record<string, unknown>[],
  createDeal: vi.fn(),
  createTask: vi.fn(),
  notifyDealCreated: vi.fn(),
  guardarDatosDeContacto: vi.fn(),
  hayOtroContactoCon: vi.fn(),
  canAccessContact: vi.fn(),
  existeContacto: vi.fn(),
  convertirSolicitud: vi.fn(),
  syncMailchimpBestEffort: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => m.usuario),
  requirePermission: vi.fn(async () => m.usuario),
}))
vi.mock('@/lib/supabase/deals', () => ({
  getDeals: vi.fn(),
  createDeal: m.createDeal,
  leerProcesoParaConvertir: vi.fn(),
  convertirSolicitud: m.convertirSolicitud,
  syncMailchimpBestEffort: m.syncMailchimpBestEffort,
}))
vi.mock('@/lib/supabase/tasks', () => ({ createTask: m.createTask }))
vi.mock('@/lib/email/notifications/deal-created', () => ({ notifyDealCreated: m.notifyDealCreated }))
vi.mock('@/lib/deals/asesor-asignable', () => ({ esAsesorAsignable: vi.fn(async () => true) }))
vi.mock('@/lib/email/notify-with-escalation', () => ({
  notifyWithEscalation: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}))
vi.mock('@/lib/supabase/contactos', () => ({
  guardarDatosDeContacto: m.guardarDatosDeContacto,
  hayOtroContactoCon: m.hayOtroContactoCon,
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: m.canAccessContact }))
vi.mock('@/lib/supabase/actividades', () => ({ existeContacto: m.existeContacto }))
// La búsqueda de hoy por email y teléfono usa el cliente directo. Con `contact_id` no
// tiene que correr; sin él, corre como siempre (no encuentra a nadie y crea).
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      m.consultasDirectas.push(tabla)
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.in = () => q
      q.order = () => q
      q.limit = () => q
      q.maybeSingle = async () => ({ data: null, error: null })
      q.insert = (fila: Record<string, unknown>) => {
        m.contactosCreados.push(fila)
        return { select: () => ({ single: async () => ({ data: { id: 'contacto-nuevo' }, error: null }) }) }
      }
      return q
    },
  }),
}))

import { POST } from './route'
import { NextRequest } from 'next/server'

const pedido = (body: unknown) =>
  new NextRequest('http://local/api/deals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const completo = {
  contact_id: 'c-clase',
  contact_name: 'Marta Gómez',
  contact_phone: '11 5555-4444',
  contact_email: 'Marta@Example.com',
  property_address: 'Av. Belgrano 1500',
  scheduled_date: '2026-12-01',
  origin: 'referido',
  assigned_to: 'asesor-9',
  property_type: 'departamento',
  neighborhood: 'Monserrat',
  rooms: 2,
}

beforeEach(() => {
  vi.clearAllMocks()
  m.usuario = { id: 'coord-1', email: 'c@x.com', profile: { id: 'coord-1', role: 'coordinador' } }
  m.orden = []
  m.consultasDirectas = []
  m.contactosCreados = []
  m.canAccessContact.mockResolvedValue(true)
  m.existeContacto.mockResolvedValue(true)
  m.createDeal.mockImplementation(async () => { m.orden.push('proceso'); return 'deal-nuevo' })
  m.guardarDatosDeContacto.mockImplementation(async () => { m.orden.push('contacto') })
  m.hayOtroContactoCon.mockResolvedValue(false)
  m.createTask.mockImplementation(async () => { m.orden.push('tarea') })
  m.notifyDealCreated.mockImplementation(async () => { m.orden.push('email') })
})

describe('POST /api/deals con contact_id', () => {
  it('contacto válido: crea un proceso NUEVO con ese contacto, sin buscar otro ni crear uno', async () => {
    const res = await POST(pedido(completo))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, id: 'deal-nuevo', contact_id: 'c-clase' })
    expect(m.createDeal).toHaveBeenCalledWith(expect.objectContaining({ contact_id: 'c-clase', origin: 'referido', assigned_to: 'asesor-9' }), expect.any(String))
    expect(m.consultasDirectas).toEqual([])
    expect(m.contactosCreados).toEqual([])
    expect(m.convertirSolicitud).not.toHaveBeenCalled()
  })

  it('después de crear el proceso guarda en ESE contacto los datos validados; luego tarea y email', async () => {
    await POST(pedido(completo))
    expect(m.guardarDatosDeContacto).toHaveBeenCalledWith('c-clase', {
      full_name: 'Marta Gómez',
      phone: expect.any(String),
      email: 'marta@example.com',
    })
    expect(m.orden).toEqual(['proceso', 'contacto', 'tarea', 'email'])
  })

  it('contacto sin email al que la coordinadora se lo completa: queda guardado en la persona', async () => {
    await POST(pedido({ ...completo, contact_email: 'nuevo@example.com' }))
    expect(m.guardarDatosDeContacto).toHaveBeenCalledWith('c-clase', expect.objectContaining({ email: 'nuevo@example.com' }))
  })

  it('email que ya tiene otro contacto → 200 con warning', async () => {
    m.hayOtroContactoCon.mockResolvedValue(true)
    const body = await (await POST(pedido(completo))).json()
    expect(body.warning).toMatch(/Ya hay otro contacto/)
  })

  it('falla guardar el contacto (dos veces) → 200 con warning, el proceso quedó creado', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.guardarDatosDeContacto.mockRejectedValue(new Error('x'))
    const res = await POST(pedido(completo))
    expect(res.status).toBe(200)
    expect((await res.json()).warning).toMatch(/no se pudieron guardar los datos corregidos/)
    expect(m.createDeal).toHaveBeenCalled()
    err.mockRestore()
  })

  it('contacto que el asesor no puede ver → 404 sin escribir nada', async () => {
    m.usuario = { id: 'asesor-1', email: 'a@x.com', profile: { id: 'asesor-1', role: 'asesor' } }
    m.canAccessContact.mockResolvedValue(false)
    const res = await POST(pedido(completo))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
    expect(m.createDeal).not.toHaveBeenCalled()
    expect(m.guardarDatosDeContacto).not.toHaveBeenCalled()
    expect(m.notifyDealCreated).not.toHaveBeenCalled()
  })

  it('contacto que no existe (coordinadora) → 404 sin escribir nada', async () => {
    m.existeContacto.mockResolvedValue(false)
    expect((await POST(pedido(completo))).status).toBe(404)
    expect(m.createDeal).not.toHaveBeenCalled()
  })

  it('from_deal_id y contact_id juntos → 400 sin escribir nada', async () => {
    const res = await POST(pedido({ ...completo, from_deal_id: 'd-1' }))
    expect(res.status).toBe(400)
    expect(m.createDeal).not.toHaveBeenCalled()
    expect(m.convertirSolicitud).not.toHaveBeenCalled()
    expect(m.guardarDatosDeContacto).not.toHaveBeenCalled()
  })

  it('sin contact_id ni from_deal_id: el comportamiento de hoy (busca, crea el contacto y no lo corrige después)', async () => {
    const { contact_id: _sinContacto, ...deHoy } = completo
    void _sinContacto
    const res = await POST(pedido(deHoy))
    expect(res.status).toBe(200)
    expect(m.consultasDirectas.length).toBeGreaterThan(0)
    expect(m.contactosCreados).toHaveLength(1)
    expect(m.guardarDatosDeContacto).not.toHaveBeenCalled()
    expect(m.canAccessContact).not.toHaveBeenCalled()
    expect((await res.json()).warning).toBeUndefined()
  })
})
