/**
 * Avanzar un proceso exige los datos del cliente (decisión del dueño, 2026-09-18).
 * La barrera está en el servidor: un pedido directo tampoco puede mover la etapa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: {
    datos: { stage: 'appraisal_sent', faltan: [] as string[] } as { stage: string; faltan: string[] } | null,
    etapas: [] as string[],
    vinculadas: [] as string[],
    tasacionesVinculadas: [] as string[],
  },
}))

vi.mock('@/lib/auth/require-role', () => ({ requirePermission: vi.fn(async () => ({ id: 'u', profile: { role: 'admin' } })) }))
vi.mock('@/lib/deals/datos-cliente', async () => {
  const real = await vi.importActual<typeof import('@/lib/deals/datos-cliente')>('@/lib/deals/datos-cliente')
  return { ...real, leerDatosDelProceso: vi.fn(async () => estado.datos) }
})
vi.mock('@/lib/supabase/deals', () => ({
  updateDealStage: vi.fn(async (_id: string, stage: string) => { estado.etapas.push(stage) }),
  linkPropertyToDeal: vi.fn(async (_id: string, p: string) => { estado.vinculadas.push(p) }),
  linkAppraisalToDeal: vi.fn(async (_id: string, a: string) => { estado.tasacionesVinculadas.push(a) }),
  getDeal: vi.fn(async () => ({ stage: estado.datos?.stage, appraisal_id: null, property_address: 'x', contact_id: 'c' })),
}))
vi.mock('@/lib/supabase/tasks', () => ({ createTaskForRole: vi.fn(async () => {}) }))
vi.mock('@/lib/email/notifications/appraisal-sent', () => ({ notifyAppraisalSent: vi.fn(async () => {}) }))
vi.mock('@/lib/email/notifications/visit-completed', () => ({ notifyVisitCompleted: vi.fn(async () => {}) }))
vi.mock('@/lib/email/notify-with-escalation', () => ({ notifyWithEscalation: vi.fn(async () => {}) }))

import { POST } from './route'
import { NextRequest } from 'next/server'

const params = Promise.resolve({ id: 'deal-1' })
const pedido = (body: unknown) => new NextRequest('http://local/api/deals/deal-1/advance', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  estado.datos = { stage: 'appraisal_sent', faltan: [] }
  estado.etapas = []; estado.vinculadas = []; estado.tasacionesVinculadas = []
})

describe('POST /api/deals/[id]/advance — datos del cliente', () => {
  it('con datos completos avanza como siempre', async () => {
    const res = await POST(pedido({ stage: 'followup' }), { params })
    expect(res.status).toBe(200)
    expect(estado.etapas).toEqual(['followup'])
  })

  it('sin email NO avanza: 422 con lo que falta, y la etapa no se toca', async () => {
    estado.datos = { stage: 'appraisal_sent', faltan: ['email'] }
    const res = await POST(pedido({ stage: 'followup' }), { params })
    expect(res.status).toBe(422)
    const j = await res.json()
    expect(j).toMatchObject({ code: 'DATOS_DEL_CLIENTE', faltan: ['email'], dealId: 'deal-1' })
    expect(j.error).toBe('Para avanzar falta el email del cliente.')
    expect(estado.etapas).toEqual([])
  })

  it('captar vinculando la propiedad también se frena', async () => {
    estado.datos = { stage: 'appraisal_sent', faltan: ['telefono'] }
    const res = await POST(pedido({ stage: 'captured', property_id: 'p-1' }), { params })
    expect(res.status).toBe(422)
    expect(estado.vinculadas).toEqual([])
  })

  it('descartar y "no se realizó" pasan sin pedir nada', async () => {
    estado.datos = { stage: 'scheduled', faltan: ['nombre', 'telefono', 'email', 'asesor'] }
    expect((await POST(pedido({ stage: 'lost' }), { params })).status).toBe(200)
    expect((await POST(pedido({ stage: 'not_visited' }), { params })).status).toBe(200)
    expect(estado.etapas).toEqual(['lost', 'not_visited'])
  })

  it('vincular la tasación recién creada NO es mover la etapa: no se frena', async () => {
    estado.datos = { stage: 'visited', faltan: ['email'] }
    const res = await POST(pedido({ stage: 'appraisal_sent', appraisal_id: 't-1' }), { params })
    expect(res.status).toBe(200)
    expect(estado.tasacionesVinculadas).toEqual(['t-1'])
    expect(estado.etapas).toEqual([])
  })

  it('otro seguimiento dentro de Seguimiento no es moverse', async () => {
    estado.datos = { stage: 'followup', faltan: ['email'] }
    const res = await POST(pedido({ stage: 'followup', notes: 'llamé' }), { params })
    expect(res.status).toBe(200)
  })

  it('un proceso que no existe → 404', async () => {
    estado.datos = null
    const res = await POST(pedido({ stage: 'followup' }), { params })
    expect(res.status).toBe(404)
  })
})
