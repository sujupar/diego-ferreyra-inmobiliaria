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
vi.mock('@/lib/email/notify-with-escalation', () => ({ notifyWithEscalation: vi.fn() }))

// El GET resuelve los nombres de los asesores con el cliente admin.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.in = () => Promise.resolve({ data: [], error: null })
      return q
    },
  }),
}))

import { GET } from './route'

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
