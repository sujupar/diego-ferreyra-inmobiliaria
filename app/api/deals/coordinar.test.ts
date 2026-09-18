/**
 * "Coordinar tasación" (POST /api/deals) es la otra puerta por la que nace un
 * proceso. Solo exigía nombre y dirección: teléfono, email y asesor eran
 * opcionales, y por ahí entraron procesos que nadie podía llamar ni veía en su
 * CRM. Desde el 2026-09-18 exige lo mismo que la tasación manual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: {
    usuario: { id: 'coord-1', profile: { id: 'coord-1', role: 'coordinador' } },
    procesos: [] as Record<string, unknown>[],
    contactosCreados: [] as Record<string, unknown>[],
  },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => estado.usuario),
  requirePermission: vi.fn(async () => estado.usuario),
}))
vi.mock('@/lib/supabase/deals', () => ({
  getDeals: vi.fn(),
  createDeal: vi.fn(async (input: Record<string, unknown>) => { estado.procesos.push(input); return 'deal-nuevo' }),
}))
vi.mock('@/lib/supabase/tasks', () => ({ createTask: vi.fn(async () => {}), createTaskForRole: vi.fn() }))
vi.mock('@/lib/email/notifications/deal-created', () => ({ notifyDealCreated: vi.fn(async () => {}) }))
vi.mock('@/lib/email/notify-with-escalation', () => ({ notifyWithEscalation: vi.fn(async () => {}) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.in = () => q
      q.order = () => q
      q.limit = () => q
      q.maybeSingle = async () => ({ data: null, error: null })
      q.insert = (fila: Record<string, unknown>) => {
        estado.contactosCreados.push(fila)
        return { select: () => ({ single: async () => ({ data: { id: 'contacto-nuevo' }, error: null }) }) }
      }
      return q
    },
  }),
}))

import { POST } from './route'
import { NextRequest } from 'next/server'

const completo = {
  contact_name: 'Marta Gómez', contact_phone: '11 5555-4444', contact_email: 'Marta@Example.com',
  property_address: 'Av. Belgrano 1500', scheduled_date: '2026-09-20', origin: 'referido',
  assigned_to: 'asesor-9', property_type: 'departamento', neighborhood: 'Monserrat', rooms: 2,
}
const pedido = (body: unknown) => new NextRequest('http://local/api/deals', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  estado.usuario = { id: 'coord-1', profile: { id: 'coord-1', role: 'coordinador' } }
  estado.procesos = []
  estado.contactosCreados = []
})

describe('POST /api/deals — Coordinar tasación exige los datos del cliente', () => {
  it('con todo, coordina como siempre y guarda el email limpio', async () => {
    const res = await POST(pedido(completo))
    expect(res.status).toBe(200)
    expect(estado.contactosCreados[0]).toMatchObject({ full_name: 'Marta Gómez', email: 'marta@example.com' })
    expect(estado.procesos[0]).toMatchObject({ assigned_to: 'asesor-9', contact_id: 'contacto-nuevo' })
  })

  it('sin email NO se crea nada', async () => {
    const res = await POST(pedido({ ...completo, contact_email: '' }))
    expect(res.status).toBe(400)
    expect((await res.json()).errores).toContain('Falta el email.')
    expect(estado.procesos).toHaveLength(0)
    expect(estado.contactosCreados).toHaveLength(0)
  })

  it('un teléfono incompleto tampoco', async () => {
    const res = await POST(pedido({ ...completo, contact_phone: '4444-5555' }))
    expect(res.status).toBe(400)
    expect(estado.procesos).toHaveLength(0)
  })

  it('sin asesor tampoco: no le aparecería a nadie en su CRM', async () => {
    const res = await POST(pedido({ ...completo, assigned_to: '' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/asesor/i)
  })

  it('un asesor coordina a SU nombre, elija lo que elija', async () => {
    estado.usuario = { id: 'asesor-yo', profile: { id: 'asesor-yo', role: 'asesor' } }
    const res = await POST(pedido({ ...completo, assigned_to: 'otro-asesor' }))
    expect(res.status).toBe(200)
    expect(estado.procesos[0]).toMatchObject({ assigned_to: 'asesor-yo' })
  })
})
