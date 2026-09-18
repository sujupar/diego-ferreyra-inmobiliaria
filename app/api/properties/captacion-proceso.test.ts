/**
 * Captar una propiedad tiene que mover SU proceso a "Captada".
 *
 * Antes el vínculo lo hacía el navegador con un pedido aparte, y solo cuando se
 * entraba desde la ficha del proceso. Entrando desde la tasación (que es como
 * se capta casi siempre) el proceso quedaba en "Tasación Entregada" para
 * siempre, la propiedad no heredaba los datos de la visita y nada frenaba
 * captar dos veces la misma tasación: pasó con Hipólito Yrigoyen 1550.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: {
    creadas: [] as Record<string, unknown>[],
    vinculadas: [] as { dealId: string; propertyId: string }[],
    // Lo que "hay" en la base para la consulta del proceso y sus propiedades.
    dealsDeLaTasacion: [] as { id: string; property_id?: string | null }[],
    propiedadDelProceso: null as { id: string; status?: string; commercial_status?: string } | null,
    propiedadesDeLaTasacion: [] as { id: string; status?: string; commercial_status?: string }[],
    // Las que cuelgan del proceso sin tener `appraisal_id` (vienen del CSV).
    propiedadesSueltas: [] as { id: string; status?: string; commercial_status?: string }[],
    visitData: null as unknown,
    rol: 'admin',
    accedeAlProceso: true,
    faltanDatos: [] as string[],
  },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1', profile: { id: 'user-1', role: estado.rol } })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessDeal: vi.fn(async () => estado.accedeAlProceso) }))
vi.mock('@/lib/deals/datos-cliente', async () => {
  const real = await vi.importActual<typeof import('@/lib/deals/datos-cliente')>('@/lib/deals/datos-cliente')
  return { ...real, leerDatosDelProceso: vi.fn(async () => ({ stage: 'appraisal_sent', faltan: estado.faltanDatos })) }
})
vi.mock('@/lib/supabase/properties', () => ({
  createProperty: vi.fn(async (input: Record<string, unknown>) => { estado.creadas.push(input); return 'prop-nueva' }),
  getPropertiesListPage: vi.fn(async () => ({ data: [], total: 0, hasMore: false })),
  checkAndAdvanceProperty: vi.fn(async () => true),
  updateProperty: vi.fn(async () => {}),
}))
vi.mock('@/lib/supabase/deals', () => ({
  linkPropertyToDeal: vi.fn(async (dealId: string, propertyId: string) => { estado.vinculadas.push({ dealId, propertyId }) }),
}))
vi.mock('@/lib/properties/geocode-on-write', () => ({ geocodePropertyBestEffort: vi.fn(async () => {}) }))
vi.mock('@/lib/email/notifications/property-created', () => ({ notifyPropertyCreated: vi.fn(async () => {}) }))
vi.mock('@/lib/email/notify-with-escalation', () => ({ notifyWithEscalation: vi.fn(async () => {}) }))

// Base falsa: responde las tres consultas que hace la resolución del proceso.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://x/y.jpg' } }) }) },
    from: (tabla: string) => {
      const q: Record<string, unknown> = {}
      const resolver = () => {
        if (tabla === 'deals') return Promise.resolve({ data: estado.dealsDeLaTasacion, error: null })
        return Promise.resolve({ data: estado.propiedadesDeLaTasacion, error: null })
      }
      q.select = () => q
      q.eq = () => q
      // `in` solo lo usa la búsqueda de las propiedades que cuelgan del proceso
      // por `deals.property_id`; `neq` es la de la tasación.
      q.in = () => (tabla === 'deals' ? resolver() : Promise.resolve({ data: estado.propiedadesSueltas, error: null }))
      q.neq = () => resolver()
      q.maybeSingle = () => {
        if (tabla === 'deals') {
          const d = estado.dealsDeLaTasacion[0]
          return Promise.resolve({ data: d ? { property_id: d.property_id ?? null, visit_data: estado.visitData } : null, error: null })
        }
        return Promise.resolve({ data: estado.propiedadDelProceso, error: null })
      }
      q.then = (fn: (v: unknown) => unknown) => resolver().then(fn)
      return q
    },
  }),
}))

import { POST } from './route'
import { NextRequest } from 'next/server'

const base = {
  address: 'Av. Belgrano 1500', neighborhood: 'Monserrat', asking_price: 100000,
  assigned_to: '00000000-0000-0000-0000-000000000009',
}

function pedido(body: unknown) {
  return new NextRequest('http://local/api/properties', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  estado.creadas = []
  estado.vinculadas = []
  estado.dealsDeLaTasacion = []
  estado.propiedadDelProceso = null
  estado.propiedadesDeLaTasacion = []
  estado.propiedadesSueltas = []
  estado.visitData = null
  estado.rol = 'admin'
  estado.accedeAlProceso = true
  estado.faltanDatos = []
})

describe('POST /api/properties — vínculo con el proceso', () => {
  it('con el proceso elegido, lo vincula y lo pasa a Captada', async () => {
    const res = await POST(pedido({ ...base, deal_id: 'deal-1' }))
    expect(res.status).toBe(200)
    expect(estado.vinculadas).toEqual([{ dealId: 'deal-1', propertyId: 'prop-nueva' }])
    // `deal_id` no es una columna de properties: no puede viajar al INSERT.
    expect(estado.creadas[0]).not.toHaveProperty('deal_id')
  })

  it('captando desde la tasación resuelve solo el proceso de esa tasación', async () => {
    estado.dealsDeLaTasacion = [{ id: 'deal-7', property_id: null }]
    const res = await POST(pedido({ ...base, appraisal_id: 'tasacion-1' }))
    expect(res.status).toBe(200)
    expect(estado.vinculadas).toEqual([{ dealId: 'deal-7', propertyId: 'prop-nueva' }])
  })

  it('hereda de la visita las expensas y los datos de portales y landing', async () => {
    estado.dealsDeLaTasacion = [{ id: 'deal-7', property_id: null }]
    estado.visitData = {
      sale: null,
      portales: { expensas: 85000, ml: { HAS_LIFT: { value_name: 'Sí' } }, ap: {} },
      landing: { q1: 'Pareja joven', q2: 'Luz', q3: 'Expensas', q4: 'Subte' },
    }
    await POST(pedido({ ...base, appraisal_id: 'tasacion-1' }))
    const creada = estado.creadas[0]
    expect(creada.expensas).toBe(85000)
    expect((creada.portal_data as { ml: Record<string, unknown> }).ml).toHaveProperty('HAS_LIFT')
    expect(creada.landing_answers).toMatchObject({ q1: 'Pareja joven' })
  })

  it('lo que manda la pantalla gana sobre lo heredado', async () => {
    estado.dealsDeLaTasacion = [{ id: 'deal-7', property_id: null }]
    estado.visitData = { sale: null, portales: { expensas: 85000, ml: {}, ap: {} }, landing: {} }
    await POST(pedido({ ...base, appraisal_id: 'tasacion-1', expensas: 99000 }))
    expect(estado.creadas[0].expensas).toBe(99000)
  })

  it('frena el duplicado: esa tasación ya tiene una propiedad activa', async () => {
    estado.dealsDeLaTasacion = [{ id: 'deal-7', property_id: null }]
    estado.propiedadesDeLaTasacion = [{ id: 'prop-vieja', status: 'approved', commercial_status: 'disponible' }]
    const res = await POST(pedido({ ...base, appraisal_id: 'tasacion-1' }))
    expect(res.status).toBe(409)
    expect((await res.json()).propertyId).toBe('prop-vieja')
    expect(estado.creadas).toHaveLength(0)
    expect(estado.vinculadas).toHaveLength(0)
  })

  it('también frena si la propiedad cuelga del proceso sin tener la tasación encima', async () => {
    // Caso real: las 25 del CSV se vincularon al proceso a mano, así que no
    // tienen `appraisal_id`. Buscando solo por la tasación no aparecerían.
    estado.dealsDeLaTasacion = [{ id: 'deal-7', property_id: 'prop-csv' }]
    estado.propiedadesSueltas = [{ id: 'prop-csv', status: 'approved', commercial_status: 'disponible' }]
    const res = await POST(pedido({ ...base, appraisal_id: 'tasacion-1' }))
    expect(res.status).toBe(409)
    expect((await res.json()).propertyId).toBe('prop-csv')
    expect(estado.creadas).toHaveLength(0)
  })

  it('una propiedad descartada no frena: se puede volver a captar', async () => {
    estado.dealsDeLaTasacion = [{ id: 'deal-7', property_id: null }]
    estado.propiedadesDeLaTasacion = [{ id: 'prop-vieja', status: 'descartada', commercial_status: 'descartada' }]
    const res = await POST(pedido({ ...base, appraisal_id: 'tasacion-1' }))
    expect(res.status).toBe(200)
    expect(estado.vinculadas).toHaveLength(1)
  })

  it('si la tasación tiene DOS procesos no adivina: crea la propiedad sin vincular', async () => {
    estado.dealsDeLaTasacion = [{ id: 'deal-7' }, { id: 'deal-8' }]
    const res = await POST(pedido({ ...base, appraisal_id: 'tasacion-1' }))
    expect(res.status).toBe(200)
    expect(estado.vinculadas).toHaveLength(0)
  })

  it('sin proceso ni tasación sigue creando la propiedad (altas sueltas y cargas masivas)', async () => {
    const res = await POST(pedido(base))
    expect(res.status).toBe(200)
    expect(estado.vinculadas).toHaveLength(0)
  })

  it('si el vínculo falla, la propiedad igual queda creada y avisa', async () => {
    const { linkPropertyToDeal } = await import('@/lib/supabase/deals')
    vi.mocked(linkPropertyToDeal).mockRejectedValueOnce(new Error('cayó la base'))
    const res = await POST(pedido({ ...base, deal_id: 'deal-1' }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.id).toBe('prop-nueva')
    expect(j.avisoProceso).toMatch(/proceso/i)
  })
})

describe('POST /api/properties — quién puede mover el proceso', () => {
  it('un rol sin permiso de avanzar procesos (abogado) no puede mover uno mandando deal_id', async () => {
    estado.rol = 'abogado'
    const res = await POST(pedido({ ...base, deal_id: 'deal-1' }))
    expect(res.status).toBe(403)
    expect(estado.creadas).toHaveLength(0)
    expect(estado.vinculadas).toHaveLength(0)
  })

  it('un asesor no puede mover el proceso de OTRO asesor', async () => {
    estado.rol = 'asesor'
    estado.accedeAlProceso = false
    const res = await POST(pedido({ ...base, deal_id: 'deal-ajeno' }))
    expect(res.status).toBe(403)
    expect(estado.vinculadas).toHaveLength(0)
  })

  it('un asesor con SU proceso sí', async () => {
    estado.rol = 'asesor'
    const res = await POST(pedido({ ...base, deal_id: 'deal-1' }))
    expect(res.status).toBe(200)
    expect(estado.vinculadas).toHaveLength(1)
  })

  it('desde la tasación, si el proceso es ajeno se capta igual pero SIN moverlo, y avisa', async () => {
    estado.rol = 'asesor'
    estado.accedeAlProceso = false
    estado.dealsDeLaTasacion = [{ id: 'deal-ajeno', property_id: null }]
    const res = await POST(pedido({ ...base, appraisal_id: 'tasacion-1' }))
    expect(res.status).toBe(200)
    expect(estado.vinculadas).toHaveLength(0)
    expect((await res.json()).avisoProceso).toMatch(/proceso/i)
  })
})

describe('POST /api/properties — datos del cliente para captar', () => {
  it('con el proceso elegido incompleto: 422, y la ficha NO se crea', async () => {
    estado.faltanDatos = ['email']
    const res = await POST(pedido({ ...base, deal_id: 'deal-1' }))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: 'DATOS_DEL_CLIENTE', faltan: ['email'], dealId: 'deal-1' })
    expect(estado.creadas).toHaveLength(0)
    expect(estado.vinculadas).toHaveLength(0)
  })

  it('desde la tasación, con su proceso incompleto: también frena y dice de qué proceso', async () => {
    estado.faltanDatos = ['telefono', 'email']
    estado.dealsDeLaTasacion = [{ id: 'deal-7', property_id: null }]
    const res = await POST(pedido({ ...base, appraisal_id: 'tasacion-1' }))
    expect(res.status).toBe(422)
    expect((await res.json()).dealId).toBe('deal-7')
    expect(estado.creadas).toHaveLength(0)
  })

  it('sin proceso no hay nada que exigir: se crea como antes', async () => {
    estado.faltanDatos = ['email']
    const res = await POST(pedido(base))
    expect(res.status).toBe(200)
  })
})
