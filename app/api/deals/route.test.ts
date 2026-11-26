/**
 * Alcance server-side del listado de deals.
 *
 * El filtro "ver solo mis deals" vivía únicamente en la pantalla, y `getDeals`
 * lee con el cliente service-role (RLS no aplica). O sea: un asesor con sesión
 * válida abría la consola y con `fetch('/api/deals?assigned_to=<id ajeno>')` se
 * llevaba los deals de otro, con nombre, teléfono y email del contacto.
 *
 * EL test es el primero: lo que se verifica no es el status de la respuesta
 * sino con QUÉ id sale la consulta a la base.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, getDealsMock } = vi.hoisted(() => ({
  estado: { role: 'admin' as string, id: 'yo-1' },
  getDealsMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: estado.id,
    email: 'quien@ejemplo.com',
    profile: { id: estado.id, role: estado.role },
  })),
  requirePermission: vi.fn(),
}))

vi.mock('@/lib/supabase/deals', () => ({
  getDeals: getDealsMock,
  createDeal: vi.fn(),
}))

vi.mock('@/lib/supabase/tasks', () => ({ createTask: vi.fn(), createTaskForRole: vi.fn() }))
vi.mock('@/lib/email/notifications/deal-created', () => ({ notifyDealCreated: vi.fn() }))
vi.mock('@/lib/deals/asesor-asignable', () => ({ esAsesorAsignable: vi.fn(async () => true) }))
vi.mock('@/lib/email/notify-with-escalation', () => ({ notifyWithEscalation: vi.fn() }))

// El GET resuelve los nombres de los asesores con el cliente admin. El POST (test del
// escenario de la tarea 5.6) busca el contacto por email y después por teléfono.
const { base } = vi.hoisted(() => ({
  base: {
    contactoPorTelefono: null as null | { id: string },
    contactosInsertados: [] as Record<string, unknown>[],
  },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      let porTelefono = false
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (col: string) => { porTelefono = col === 'phone_norm' || col === 'phone'; return q }
      q.order = () => q
      q.limit = () => q
      q.maybeSingle = async () => ({ data: porTelefono ? base.contactoPorTelefono : null, error: null })
      q.in = () => {
        const r: Record<string, unknown> = { ...q }
        r.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
        return r
      }
      q.insert = (fila: Record<string, unknown>) => {
        base.contactosInsertados.push(fila)
        return { select: () => ({ single: async () => ({ data: { id: 'contacto-nuevo' }, error: null }) }) }
      }
      return q
    },
  }),
}))

import { GET, POST } from './route'
import { createDeal } from '@/lib/supabase/deals'
import { requirePermission } from '@/lib/auth/require-role'
import { puedeVerContacto } from '@/lib/auth/contact-access'
import { NextRequest } from 'next/server'

const AJENO = 'otro-asesor-9'

function pedir(qs: string) {
  return GET(new Request(`http://local/api/deals${qs}`) as never)
}

function alcanceUsado(): string | undefined {
  expect(getDealsMock).toHaveBeenCalledTimes(1)
  return getDealsMock.mock.calls[0][0].assigned_to
}

beforeEach(() => {
  getDealsMock.mockReset()
  getDealsMock.mockResolvedValue({ data: [], total: 0, stageCounts: {}, crmStageCounts: {} })
})

describe('GET /api/deals — alcance forzado en el servidor', () => {
  it('un asesor que pide ?assigned_to=<id ajeno> recibe SOLO lo suyo: la consulta sale con SU id', async () => {
    estado.role = 'asesor'
    estado.id = 'asesor-1'
    const res = await pedir(`?assigned_to=${AJENO}`)
    expect(res.status).toBe(200)
    expect(alcanceUsado()).toBe('asesor-1')
    expect(alcanceUsado()).not.toBe(AJENO)
  })

  it('un asesor sin parámetro también queda acotado a lo suyo', async () => {
    estado.role = 'asesor'
    estado.id = 'asesor-1'
    await pedir('')
    expect(alcanceUsado()).toBe('asesor-1')
  })

  it('el legacy agent (pipeline.view_own) también queda acotado', async () => {
    estado.role = 'agent'
    estado.id = 'agente-legacy'
    await pedir(`?assigned_to=${AJENO}`)
    expect(alcanceUsado()).toBe('agente-legacy')
  })

  it.each(['admin', 'dueno', 'coordinador'])(
    'un %s sigue viendo todo cuando no filtra',
    async (role) => {
      estado.role = role
      estado.id = 'jefe-1'
      await pedir('')
      expect(alcanceUsado()).toBeUndefined()
    },
  )

  it.each(['admin', 'dueno', 'coordinador'])(
    'a un %s le sigue funcionando el filtro por asesor',
    async (role) => {
      estado.role = role
      estado.id = 'jefe-1'
      await pedir(`?assigned_to=${AJENO}`)
      expect(alcanceUsado()).toBe(AJENO)
    },
  )

  it.each(['abogado', 'viewer'])(
    'un %s queda acotado a su propio id (fail-closed: no tiene ninguno de los dos permisos)',
    async (role) => {
      estado.role = role
      estado.id = 'sin-crm-1'
      await pedir(`?assigned_to=${AJENO}`)
      expect(alcanceUsado()).toBe('sin-crm-1')
    },
  )

  it('el resto de los filtros de la pantalla sigue viajando igual', async () => {
    estado.role = 'admin'
    await pedir('?stage=scheduled&crm_stage=coordinada&origin=embudo&from=2026-01-01&to=2026-01-31&limit=25&offset=50')
    const args = getDealsMock.mock.calls[0][0]
    expect(args).toMatchObject({
      stage: 'scheduled',
      crm_stage: 'coordinada',
      origin: 'embudo',
      from: '2026-01-01',
      to: '2026-01-31',
      limit: 25,
      offset: 50,
    })
  })

  it('la forma de la respuesta exitosa no cambia', async () => {
    estado.role = 'admin'
    getDealsMock.mockResolvedValue({
      data: [{ id: 'd1', assigned_to: null, contacts: { full_name: 'Ana', phone: '11', email: 'a@b.c' } }],
      total: 1,
      stageCounts: { scheduled: 1 },
      crmStageCounts: { coordinada: 1 },
    })
    const res = await pedir('')
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['crmStageCounts', 'data', 'stageCounts', 'total'])
    expect(body.data[0]).toMatchObject({
      id: 'd1',
      contact_name: 'Ana',
      contact_phone: '11',
      contact_email: 'a@b.c',
      assigned_to_name: '',
    })
  })
})

// Escenario "Asesor coordina una tasación con el teléfono de una persona ya cargada"
// (spec crm-ficha-contacto, tarea 5.6). Es un test de lo que YA hace la ruta: si falla,
// no se "arregla" la ruta sin avisar.
describe('POST /api/deals — asesor coordina con el teléfono de una persona ya cargada', () => {
  const asesor = { id: 'asesor-1', email: 'a@ejemplo.com', profile: { id: 'asesor-1', role: 'asesor' } }
  const cuerpo = {
    contact_name: 'Marta Gómez', contact_phone: '11 5555-4444', contact_email: 'marta.nueva@example.com',
    property_address: 'Av. Belgrano 1500', scheduled_date: '2026-12-01', origin: 'referido',
    property_type: 'departamento', neighborhood: 'Monserrat', rooms: 2,
  }
  beforeEach(() => {
    base.contactoPorTelefono = { id: 'contacto-de-otro' }
    base.contactosInsertados = []
    vi.mocked(requirePermission).mockResolvedValue(asesor as never)
    vi.mocked(createDeal).mockReset()
    vi.mocked(createDeal).mockResolvedValue('deal-nuevo')
  })

  it('responde 200 como hoy, no inserta un contacto nuevo y el proceso queda con ese contacto y a su nombre', async () => {
    const res = await POST(new NextRequest('http://local/api/deals', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, id: 'deal-nuevo', contact_id: 'contacto-de-otro' })
    expect(base.contactosInsertados).toEqual([])
    expect(vi.mocked(createDeal).mock.calls[0][0]).toMatchObject({ contact_id: 'contacto-de-otro', assigned_to: 'asesor-1' })
  })

  it('con ese proceso a su nombre, el contacto ya se le abre (puedeVerContacto)', () => {
    expect(
      puedeVerContacto(
        { id: 'asesor-1', role: 'asesor' },
        { assigned_to: 'otro-asesor', created_by: 'otro-asesor', asesoresDeProcesos: ['asesor-1'], asesoresDeTasaciones: [] },
      ),
    ).toBe(true)
  })
})
