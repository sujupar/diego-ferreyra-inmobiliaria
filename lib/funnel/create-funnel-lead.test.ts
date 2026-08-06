import { describe, it, expect, vi, beforeEach } from 'vitest'

// `create-funnel-lead.ts` importa (transitivamente, vía las notificaciones) el
// paquete `server-only`, que existe solo en el bundle de Next.js y no resuelve
// bajo el resolver de vitest (entorno node). `resolveFunnelMapping` es pura y no
// depende de nada de eso, así que stubbeamos `server-only` como módulo vacío para
// poder cargar el módulo y testear la función pura sin tocar el código de prod.
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
// I/O — createFunnelLead: la atribución de campaña debe llegar a las columnas
// meta_* del deal en el MISMO insert, ANTES de que se dispare la notificación.
//
// Contexto (Hallazgo 1 de la review de fix/email-solicitud-tasacion): antes,
// `app/api/funnel/submit/route.ts` escribía esas columnas con un UPDATE
// posterior, DESPUÉS de que `createFunnelLead` ya había hecho `await` de la
// notificación completa — el email de "Nueva solicitud de tasación" siempre
// mostraba "Campaña: —" porque el dato todavía no existía cuando se armó.
//
// Mockeamos `@supabase/supabase-js` (mismo patrón que
// `lib/leads/visit-scheduling.test.ts` / `lib/leads/pipeline-state.test.ts`) y
// las 3 piezas de notificación/escalación como módulos completos (mismo patrón
// que `app/api/webhooks/whatsapp/route.test.ts` mockea `lib/ai/analyze-conversation`)
// para no arrastrar Resend/React-email/`server-only` a este test — no hace
// falta ningún mock nuevo que el repo no tenga ya.
// ---------------------------------------------------------------------------

const order: string[] = []
const dealInsertCalls: Record<string, unknown>[] = []

function profilesSelectChain() {
  const q: { eq: () => typeof q; then: (resolve: (v: unknown) => unknown) => Promise<unknown> } = {
    eq: () => q,
    then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
  }
  return q
}

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
        order.push('deal-insert')
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'deal-1' }, error: null }) }) }
      },
    }
  }
  // Sin candidatos de coordinador (perfiles vacío): `createTaskForRole` nunca
  // llega a tocar la tabla `tasks`, así que no hace falta mockearla acá.
  if (table === 'profiles') return { select: () => profilesSelectChain() }
  throw new Error(`tabla inesperada en el mock: ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/email/notifications/appraisal-request', () => ({
  notifyAppraisalRequest: vi.fn(async () => {
    order.push('notify')
  }),
}))
vi.mock('@/lib/email/notifications/class-registration', () => ({
  notifyClassRegistration: vi.fn(async () => {
    order.push('notify')
  }),
}))
vi.mock('@/lib/email/notify-with-escalation', () => ({
  notifyWithEscalation: vi.fn(async (operation: () => Promise<unknown>) => {
    await operation()
    return { ok: true }
  }),
}))

describe('createFunnelLead (I/O) — atribución de campaña llega al deal', () => {
  beforeEach(() => {
    order.length = 0
    dealInsertCalls.length = 0
    fromMock.mockClear()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  it('vuelca las columnas meta_* en el INSERT del deal, antes de notificar', async () => {
    const { createFunnelLead } = await import('./create-funnel-lead')
    await createFunnelLead({
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
    // El insert (con la atribución adentro) ocurre ANTES que la notificación —
    // no hay un UPDATE posterior escondido (si lo hubiera, pegaría contra
    // `deals.update`, que el mock de arriba ni siquiera expone).
    expect(order).toEqual(['deal-insert', 'notify'])
  })

  it('sin atribución, el insert no fuerza columnas meta_* (comportamiento idéntico a hoy)', async () => {
    const { createFunnelLead } = await import('./create-funnel-lead')
    await createFunnelLead({
      funnel: 'tasacion',
      name: 'Juan Pérez',
      email: 'juan@example.com',
      phone: null,
    })

    expect(dealInsertCalls).toHaveLength(1)
    expect(dealInsertCalls[0]).not.toHaveProperty('meta_campaign_id')
    expect(dealInsertCalls[0]).not.toHaveProperty('origin_metadata')
    expect(order).toEqual(['deal-insert', 'notify'])
  })

  it('funnel clase también vuelca la atribución en el insert (mismo camino, cambia la notificación)', async () => {
    const { createFunnelLead } = await import('./create-funnel-lead')
    await createFunnelLead({
      funnel: 'clase',
      name: 'María López',
      email: 'maria@example.com',
      phone: null,
      attribution: { fb_ad_id: '999' },
    })

    expect(dealInsertCalls[0]).toMatchObject({ meta_ad_id: '999' })
    expect(order).toEqual(['deal-insert', 'notify'])
  })
})
