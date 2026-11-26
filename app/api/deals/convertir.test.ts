/**
 * POST /api/deals con `from_deal_id` (crm-ficha-y-llamadas, tarea 8.1; design.md D9):
 * convertir la solicitud en vez de crear un segundo proceso. Los tests que ya existían
 * de esta ruta (`route.test.ts`, `coordinar.test.ts`) no se tocan: sin `from_deal_id`
 * la ruta hace lo de hoy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  usuario: { id: 'coord-1', email: 'c@x.com', profile: { id: 'coord-1', role: 'coordinador' as string } },
  permisoFalla: false,
  orden: [] as string[],
  proceso: null as Record<string, unknown> | null,
  convierte: true,
  guardarFallas: 0,
  otroContacto: false,
  consultasDirectas: [] as string[],
  leerProcesoParaConvertir: vi.fn(),
  convertirSolicitud: vi.fn(),
  syncMailchimpBestEffort: vi.fn(),
  createDeal: vi.fn(),
  createTask: vi.fn(),
  notifyDealCreated: vi.fn(),
  guardarDatosDeContacto: vi.fn(),
  hayOtroContactoCon: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => m.usuario),
  requirePermission: vi.fn(async () => {
    // Lo mismo que hace `requirePermission` de verdad: redirige (lanza).
    if (m.permisoFalla) throw new Error('NEXT_REDIRECT')
    return m.usuario
  }),
}))
vi.mock('@/lib/supabase/deals', () => ({
  getDeals: vi.fn(),
  createDeal: m.createDeal,
  leerProcesoParaConvertir: m.leerProcesoParaConvertir,
  convertirSolicitud: m.convertirSolicitud,
  syncMailchimpBestEffort: m.syncMailchimpBestEffort,
}))
vi.mock('@/lib/supabase/tasks', () => ({ createTask: m.createTask, createTaskForRole: vi.fn() }))
vi.mock('@/lib/email/notifications/deal-created', () => ({ notifyDealCreated: m.notifyDealCreated }))
vi.mock('@/lib/email/notify-with-escalation', () => ({
  notifyWithEscalation: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}))
vi.mock('@/lib/supabase/contactos', () => ({
  guardarDatosDeContacto: m.guardarDatosDeContacto,
  hayOtroContactoCon: m.hayOtroContactoCon,
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: vi.fn(async () => true) }))
// La búsqueda de hoy por email y teléfono usa el cliente directo: con `from_deal_id`
// no tiene que correr nunca.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      m.consultasDirectas.push(tabla)
      throw new Error(`consulta directa inesperada a ${tabla}`)
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
  from_deal_id: 'd-sol',
  contact_name: 'Marta Gómez',
  contact_phone: '11 5555-4444',
  contact_email: 'Marta@Example.com',
  property_address: 'Av. Belgrano 1500',
  scheduled_date: '2026-12-01',
  scheduled_time: '10:00',
  assigned_to: 'asesor-9',
  property_type: 'departamento',
  neighborhood: 'Monserrat',
  rooms: 2,
  notes: '',
}

const SOLICITUD = {
  id: 'd-sol',
  stage: 'request',
  scheduled_date: null,
  origin: 'embudo',
  assigned_to: null,
  contact_id: 'c-1',
  notes: null,
  created_by: null,
}

const como = (role: string, id: string) => {
  m.usuario = { id, email: `${id}@x.com`, profile: { id, role } }
}

beforeEach(() => {
  vi.clearAllMocks()
  como('coordinador', 'coord-1')
  m.permisoFalla = false
  m.orden = []
  m.consultasDirectas = []
  m.proceso = { ...SOLICITUD }
  m.convierte = true
  m.guardarFallas = 0
  m.otroContacto = false
  m.leerProcesoParaConvertir.mockImplementation(async () => m.proceso)
  m.convertirSolicitud.mockImplementation(async () => {
    m.orden.push('convertir')
    return m.convierte
  })
  m.guardarDatosDeContacto.mockImplementation(async () => {
    m.orden.push('contacto')
    if (m.guardarFallas > 0) {
      m.guardarFallas--
      throw new Error('falló el contacto')
    }
  })
  m.hayOtroContactoCon.mockImplementation(async () => m.otroContacto)
  m.createTask.mockImplementation(async () => { m.orden.push('tarea') })
  m.notifyDealCreated.mockImplementation(async () => { m.orden.push('email') })
  m.syncMailchimpBestEffort.mockImplementation(async () => { m.orden.push('mailchimp') })
})

const nadaEscrito = () => {
  expect(m.convertirSolicitud).not.toHaveBeenCalled()
  expect(m.createDeal).not.toHaveBeenCalled()
  expect(m.guardarDatosDeContacto).not.toHaveBeenCalled()
  expect(m.notifyDealCreated).not.toHaveBeenCalled()
  expect(m.syncMailchimpBestEffort).not.toHaveBeenCalled()
}

describe('POST /api/deals con from_deal_id — conversión normal', () => {
  it('convierte (no crea proceso), el contacto es el del proceso y no se busca por email ni teléfono', async () => {
    const res = await POST(pedido(completo))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, id: 'd-sol', contact_id: 'c-1' })
    expect(m.createDeal).not.toHaveBeenCalled()
    expect(m.consultasDirectas).toEqual([])
    const [id, campos] = m.convertirSolicitud.mock.calls[0]
    expect(id).toBe('d-sol')
    expect(campos).toMatchObject({
      scheduled_date: '2026-12-01',
      scheduled_time: '10:00',
      assigned_to: 'asesor-9',
      property_address: 'Av. Belgrano 1500',
      property_type: 'departamento',
      neighborhood: 'Monserrat',
      rooms: 2,
    })
  })

  it('el contacto se actualiza con los datos validados (email en minúsculas) y en ESE contacto', async () => {
    await POST(pedido(completo))
    expect(m.guardarDatosDeContacto).toHaveBeenCalledWith('c-1', {
      full_name: 'Marta Gómez',
      phone: expect.any(String),
      email: 'marta@example.com',
    })
  })

  it('orden: primero el proceso, después el contacto, y los efectos tarea → email → Mailchimp (una sola vez)', async () => {
    await POST(pedido(completo))
    expect(m.orden).toEqual(['convertir', 'contacto', 'tarea', 'email', 'mailchimp'])
    expect(m.syncMailchimpBestEffort).toHaveBeenCalledTimes(1)
    expect(m.syncMailchimpBestEffort).toHaveBeenCalledWith('d-sol')
    expect(m.createTask).toHaveBeenCalledWith(expect.objectContaining({ type: 'new_assignment', deal_id: 'd-sol', contact_id: 'c-1', assigned_to: 'asesor-9' }))
    expect(m.notifyDealCreated).toHaveBeenCalledWith({ dealId: 'd-sol' })
  })

  it('si la sincronización de Mailchimp falla, la respuesta sigue siendo 200', async () => {
    m.syncMailchimpBestEffort.mockRejectedValueOnce(new Error('mailchimp caído'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(pedido(completo))
    expect(res.status).toBe(200)
    err.mockRestore()
  })

  it('un origin mandado junto con from_deal_id se ignora', async () => {
    await POST(pedido({ ...completo, origin: 'referido' }))
    expect(m.convertirSolicitud.mock.calls[0][1]).not.toHaveProperty('origin')
  })

  it('created_by vacío queda con quien coordina; uno ya cargado no se pisa', async () => {
    await POST(pedido(completo))
    expect(m.convertirSolicitud.mock.calls[0][1].created_by).toBe('coord-1')
    m.proceso = { ...SOLICITUD, created_by: 'otra-coord' }
    await POST(pedido(completo))
    expect(m.convertirSolicitud.mock.calls[1][1]).not.toHaveProperty('created_by')
  })

  it('`scheduled` sin día también se convierte, con el día nuevo', async () => {
    m.proceso = { ...SOLICITUD, stage: 'scheduled', scheduled_date: null }
    const res = await POST(pedido(completo))
    expect(res.status).toBe(200)
    expect(m.convertirSolicitud.mock.calls[0][1].scheduled_date).toBe('2026-12-01')
  })
})

describe('notas: nunca se pisan', () => {
  it('notas previas y campo vacío → el update no lleva notes', async () => {
    m.proceso = { ...SOLICITUD, notes: 'Mensaje de la persona' }
    await POST(pedido({ ...completo, notes: '   ' }))
    expect(m.convertirSolicitud.mock.calls[0][1]).not.toHaveProperty('notes')
  })
  it('notas previas y texto nuevo → las anteriores, un renglón en blanco y el texto nuevo', async () => {
    m.proceso = { ...SOLICITUD, notes: 'Mensaje de la persona' }
    await POST(pedido({ ...completo, notes: 'Tiene perro' }))
    expect(m.convertirSolicitud.mock.calls[0][1].notes).toBe('Mensaje de la persona\n\nTiene perro')
  })
  it('sin notas previas y con texto → ese texto', async () => {
    await POST(pedido({ ...completo, notes: 'Tiene perro' }))
    expect(m.convertirSolicitud.mock.calls[0][1].notes).toBe('Tiene perro')
  })
})

describe('validación', () => {
  it('from_deal_id sin scheduled_date → 400 sin escribir nada ni mandar email', async () => {
    const res = await POST(pedido({ ...completo, scheduled_date: '' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Elegí el día de la tasación')
    nadaEscrito()
  })
  it('from_deal_id con un día mal formado → 400', async () => {
    const res = await POST(pedido({ ...completo, scheduled_date: '01/12/2026' }))
    expect(res.status).toBe(400)
    nadaEscrito()
  })
  it('from_deal_id y contact_id juntos → 400 sin escribir nada', async () => {
    const res = await POST(pedido({ ...completo, contact_id: 'c-1' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Mandá el proceso o el contacto, no los dos')
    nadaEscrito()
    expect(m.leerProcesoParaConvertir).not.toHaveBeenCalled()
  })
})

describe('permiso y etapa, en este orden (motivoNoConvertir)', () => {
  it('el proceso no existe → 404', async () => {
    m.proceso = null
    expect((await POST(pedido(completo))).status).toBe(404)
    nadaEscrito()
  })
  it('asesor con solicitud ajena → 404', async () => {
    como('asesor', 'asesor-1')
    m.proceso = { ...SOLICITUD, assigned_to: 'asesor-2' }
    expect((await POST(pedido(completo))).status).toBe(404)
    nadaEscrito()
  })
  it('asesor con solicitud sin asesor → 404', async () => {
    como('asesor', 'asesor-1')
    expect((await POST(pedido(completo))).status).toBe(404)
    nadaEscrito()
  })
  it('asesor sobre un proceso ajeno ya coordinado o de la clase → 404, no 409', async () => {
    como('asesor', 'asesor-1')
    m.proceso = { ...SOLICITUD, assigned_to: 'asesor-2', stage: 'scheduled', scheduled_date: '2026-11-30' }
    expect((await POST(pedido(completo))).status).toBe(404)
    m.proceso = { ...SOLICITUD, assigned_to: 'asesor-2', origin: 'clase_gratuita' }
    expect((await POST(pedido(completo))).status).toBe(404)
    nadaEscrito()
  })
  it('asesor con solicitud propia → 200, a su nombre', async () => {
    como('asesor', 'asesor-1')
    m.proceso = { ...SOLICITUD, assigned_to: 'asesor-1' }
    const res = await POST(pedido(completo))
    expect(res.status).toBe(200)
    expect(m.convertirSolicitud.mock.calls[0][1].assigned_to).toBe('asesor-1')
  })
  it('origen clase_gratuita → 409, sin llamar a notifyDealCreated', async () => {
    m.proceso = { ...SOLICITUD, origin: 'clase_gratuita' }
    const res = await POST(pedido(completo))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/clase gratuita/)
    nadaEscrito()
  })
  it('solicitud sin contacto → 409, sin escribir, sin crear contacto, sin email ni Mailchimp', async () => {
    m.proceso = { ...SOLICITUD, contact_id: null }
    const res = await POST(pedido(completo))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/no tiene una persona vinculada/)
    nadaEscrito()
    expect(m.consultasDirectas).toEqual([])
  })
  it('proceso ya movido (la lectura lo trae en Coordinada) → 409 sin llegar al update', async () => {
    m.proceso = { ...SOLICITUD, stage: 'scheduled', scheduled_date: '2026-11-30' }
    const res = await POST(pedido(completo))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('El proceso ya cambió de etapa')
    nadaEscrito()
  })
  it('la carrera: lectura en Solicitud pero el update no cambia ninguna fila → 409, contacto intacto, sin email ni Mailchimp', async () => {
    m.convierte = false
    const res = await POST(pedido(completo))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('El proceso ya cambió de etapa')
    expect(m.guardarDatosDeContacto).not.toHaveBeenCalled()
    expect(m.notifyDealCreated).not.toHaveBeenCalled()
    expect(m.syncMailchimpBestEffort).not.toHaveBeenCalled()
    expect(m.createTask).not.toHaveBeenCalled()
  })
  it('rol sin pipeline.schedule (abogado): corta requirePermission, sin update, sin email ni Mailchimp, y no es 404', async () => {
    como('abogado', 'abog-1')
    m.permisoFalla = true
    const res = await POST(pedido(completo))
    expect(res.status).not.toBe(404)
    expect(m.leerProcesoParaConvertir).not.toHaveBeenCalled()
    nadaEscrito()
  })
})

describe('el contacto después de convertir', () => {
  it('email cambiado: no crea ni cambia de contacto, se escribe en el del proceso', async () => {
    await POST(pedido({ ...completo, contact_email: 'otra@example.com' }))
    expect(m.guardarDatosDeContacto).toHaveBeenCalledWith('c-1', expect.objectContaining({ email: 'otra@example.com' }))
    expect(m.consultasDirectas).toEqual([])
    expect(m.createDeal).not.toHaveBeenCalled()
  })
  it('email que ya tiene otro contacto → 200 con warning, y el otro no se toca', async () => {
    m.otroContacto = true
    const res = await POST(pedido(completo))
    expect(res.status).toBe(200)
    expect((await res.json()).warning).toMatch(/Ya hay otro contacto con ese email o teléfono/)
    expect(m.guardarDatosDeContacto).toHaveBeenCalledTimes(1)
    expect(m.guardarDatosDeContacto.mock.calls[0][0]).toBe('c-1')
  })
  it('falla la escritura del contacto (con su reintento) → 200 con warning; Mailchimp igual corre, después', async () => {
    m.guardarFallas = 2
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(pedido(completo))
    expect(res.status).toBe(200)
    expect((await res.json()).warning).toMatch(/no se pudieron guardar los datos corregidos/)
    expect(m.guardarDatosDeContacto).toHaveBeenCalledTimes(2)
    expect(m.orden).toEqual(['convertir', 'contacto', 'contacto', 'tarea', 'email', 'mailchimp'])
    err.mockRestore()
  })
  it('falla una vez y el reintento funciona → sin warning', async () => {
    m.guardarFallas = 1
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = await (await POST(pedido(completo))).json()
    expect(body.warning).toBeUndefined()
    err.mockRestore()
  })
})
