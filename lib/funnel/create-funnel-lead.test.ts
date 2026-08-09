import { describe, it, expect, vi, beforeEach } from 'vitest'

// Este módulo ya no arrastra `server-only` (las notificaciones se fueron a
// `side-effect-handlers.ts`), pero el stub queda por si alguna dependencia
// transitiva vuelve a traerlo: es inofensivo y evita un rojo confuso.
vi.mock('server-only', () => ({}))

import { resolveFunnelMapping } from './create-funnel-lead'

describe('resolveFunnelMapping', () => {
  it('tasacion → stage request, origin embudo, notify appraisal_request', () => {
    expect(resolveFunnelMapping('tasacion')).toEqual({
      stage: 'request',
      origin: 'embudo',
      placeholderLabel: 'Solicitud de tasación',
      notify: 'appraisal_request',
    })
  })

  it('clase → stage clase_gratuita, origin clase_gratuita, notify class', () => {
    expect(resolveFunnelMapping('clase')).toEqual({
      stage: 'clase_gratuita',
      origin: 'clase_gratuita',
      placeholderLabel: 'Clase Gratuita',
      notify: 'class',
    })
  })
})

// ---------------------------------------------------------------------------
// I/O — `crearContactoYDeal` es TODO lo que pasa mientras la persona espera en
// la landing. Dos cosas que verificar y que no son lo mismo:
//
//  1. La atribución de campaña tiene que viajar en el MISMO insert del deal.
//     (Hallazgo 1 de la review de fix/email-solicitud-tasacion: antes se
//     escribía con un UPDATE posterior, DESPUÉS de notificar, y el email de
//     "Nueva solicitud de tasación" siempre mostraba "Campaña: —".)
//  2. Acá NO puede haber ninguna llamada a un tercero. El 504 del 2026-08-08
//     entró justamente por acá: Resend colgó 34,47 s dentro de este camino.
//     Los mocks de notificación/Mailchimp de abajo existen para poder afirmar
//     que NADIE los llama.
// ---------------------------------------------------------------------------

const dealInsertCalls: Record<string, unknown>[] = []
const terceros = { notify: 0, mailchimp: 0, tareas: 0 }

const fromMock = vi.fn((table: string) => {
  if (table === 'contacts') {
    return {
      select: () => ({
        ilike: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
      insert: () => ({
        select: () => ({ single: () => Promise.resolve({ data: { id: 'contact-1' }, error: null }) }),
      }),
    }
  }
  if (table === 'deals') {
    return {
      insert: (row: Record<string, unknown>) => {
        dealInsertCalls.push(row)
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'deal-1' }, error: null }) }) }
      },
    }
  }
  throw new Error(`tabla inesperada en el mock: ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/email/notifications/appraisal-request', () => ({
  notifyAppraisalRequest: vi.fn(async () => { terceros.notify += 1 }),
}))
vi.mock('@/lib/email/notifications/class-registration', () => ({
  notifyClassRegistration: vi.fn(async () => { terceros.notify += 1 }),
}))
vi.mock('@/lib/integrations/mailchimp/sync-deal', () => ({
  syncDealToMailchimp: vi.fn(async () => { terceros.mailchimp += 1 }),
}))
vi.mock('@/lib/supabase/tasks', () => ({
  createTaskForRole: vi.fn(async () => { terceros.tareas += 1 }),
}))

describe('crearContactoYDeal (I/O)', () => {
  beforeEach(() => {
    dealInsertCalls.length = 0
    terceros.notify = 0
    terceros.mailchimp = 0
    terceros.tareas = 0
    fromMock.mockClear()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  it('vuelca las columnas meta_* en el INSERT del deal', async () => {
    const { crearContactoYDeal } = await import('./create-funnel-lead')
    await crearContactoYDeal({
      funnel: 'tasacion',
      name: 'Juan Pérez',
      email: 'juan@example.com',
      phone: null,
      attribution: {
        utm_source: 'fb',
        utm_campaign: 'Captacion CABA',
        fb_campaign_id: '120',
      },
    })

    expect(dealInsertCalls).toHaveLength(1)
    expect(dealInsertCalls[0]).toMatchObject({
      meta_campaign_id: '120',
      meta_campaign_name: 'Captacion CABA',
      meta_site_source: 'fb',
    })
  })

  it('sin atribución, el insert no fuerza columnas meta_* (comportamiento idéntico a hoy)', async () => {
    const { crearContactoYDeal } = await import('./create-funnel-lead')
    await crearContactoYDeal({
      funnel: 'tasacion',
      name: 'Juan Pérez',
      email: 'juan@example.com',
      phone: null,
    })

    expect(dealInsertCalls).toHaveLength(1)
    expect(dealInsertCalls[0]).not.toHaveProperty('meta_campaign_id')
    expect(dealInsertCalls[0]).not.toHaveProperty('origin_metadata')
  })

  it('funnel clase también vuelca la atribución en el insert', async () => {
    const { crearContactoYDeal } = await import('./create-funnel-lead')
    await crearContactoYDeal({
      funnel: 'clase',
      name: 'María López',
      email: 'maria@example.com',
      phone: null,
      attribution: { fb_ad_id: '999' },
    })

    expect(dealInsertCalls[0]).toMatchObject({ meta_ad_id: '999' })
  })

  it('NO manda ningún email, ni sincroniza Mailchimp, ni crea tareas: eso se difiere', async () => {
    const { crearContactoYDeal } = await import('./create-funnel-lead')
    await crearContactoYDeal({
      funnel: 'tasacion',
      name: 'Juan Pérez',
      email: 'juan@example.com',
      phone: null,
    })

    expect(terceros).toEqual({ notify: 0, mailchimp: 0, tareas: 0 })
    // Solo dos tablas tocadas: contacts y deals. Nada más.
    expect([...new Set(fromMock.mock.calls.map((c) => c[0]))].sort()).toEqual(['contacts', 'deals'])
  })
})
