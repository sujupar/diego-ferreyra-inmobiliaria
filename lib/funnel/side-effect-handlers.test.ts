/**
 * Tests de los seis avisos diferidos.
 *
 * La regla que verifican: acá NADIE se traga su propio error. En el código
 * viejo cada aviso lo hacía (`console.warn` y a otra cosa), así que un evento de
 * conversión que Meta rechazaba se perdía para siempre — en tráfico pago eso es
 * plata. Ahora tiran y el worker decide si reintenta.
 *
 * Y la otra: `skipped` ≠ `done`. Un envío sin sesión anónima o sin `event_id`
 * del Píxel no tiene nada que hacer, y la cola tiene que decirlo tal cual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const espias = vi.hoisted(() => ({
  tareas: [] as Array<Record<string, unknown>>,
  tasacion: [] as string[],
  clase: [] as string[],
  mailchimp: [] as string[],
  mailchimpPrendido: true,
  rpcs: [] as Array<{ nombre: string; args: Record<string, unknown> }>,
  errorRpc: null as { message: string } | null,
  capi: [] as Array<Record<string, unknown>>,
  respuestaCapi: { ok: true } as { ok: boolean; error?: string },
  /** Cada llamada a `sendWhatsappTemplate`, con su input completo. */
  whatsapp: [] as Array<Record<string, unknown>>,
  respuestaWhatsapp: { ok: true, skipped: false } as
    { ok: boolean; skipped: boolean; error?: string; errorCode?: number },
  /** Escrituras `from(tabla).update(patch).eq('id', id)` — la marca del trato. */
  marcas: [] as Array<{ tabla: string; patch: Record<string, unknown>; id: string }>,
  /**
   * Lo que devuelve el envío de email. `null` = no se llegó a intentar (deal
   * ilegible o sin destinatarios). El resto es el `SendEmailResult` de
   * `sendEmail`, que NUNCA tira: por eso el handler tiene que MIRARLO.
   */
  respuestaEmail: { ok: true, sent: 2, skipped: 0, failed: 0, errors: [] } as
    | { ok: boolean; sent: number; skipped: number; failed: number; errors: string[] }
    | null,
}))

vi.mock('@/lib/supabase/tasks', () => ({
  createTaskForRole: async (rol: string, input: Record<string, unknown>) => {
    espias.tareas.push({ rol, ...input })
  },
}))
vi.mock('@/lib/email/notifications/appraisal-request', () => ({
  notifyAppraisalRequest: async ({ dealId }: { dealId: string }) => {
    espias.tasacion.push(dealId)
    return espias.respuestaEmail
  },
}))
vi.mock('@/lib/email/notifications/class-registration', () => ({
  notifyClassRegistration: async ({ dealId }: { dealId: string }) => {
    espias.clase.push(dealId)
    return espias.respuestaEmail
  },
}))
vi.mock('@/lib/integrations/mailchimp/client', () => ({
  mailchimpSyncEnabled: () => espias.mailchimpPrendido,
}))
vi.mock('@/lib/integrations/mailchimp/sync-deal', () => ({
  syncDealToMailchimp: async (dealId: string) => { espias.mailchimp.push(dealId) },
}))
vi.mock('@/lib/marketing/meta-capi', () => ({
  sendCapiEvent: async (input: Record<string, unknown>) => {
    espias.capi.push(input)
    return espias.respuestaCapi
  },
}))
vi.mock('@/lib/integrations/whatsapp/core', () => ({
  sendWhatsappTemplate: async (input: Record<string, unknown>) => {
    espias.whatsapp.push(input)
    return espias.respuestaWhatsapp
  },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      espias.rpcs.push({ nombre, args })
      return { data: null, error: espias.errorRpc }
    },
    from: (tabla: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (_columna: string, id: string) => {
          espias.marcas.push({ tabla, patch, id })
          return { data: null, error: null }
        },
      }),
    }),
  }),
}))

import { ejecutarTrabajo } from './side-effect-handlers'
import { textoDePlantilla } from '@/lib/integrations/whatsapp/cuerpos'

beforeEach(() => {
  espias.tareas = []
  espias.tasacion = []
  espias.clase = []
  espias.mailchimp = []
  espias.mailchimpPrendido = true
  espias.rpcs = []
  espias.errorRpc = null
  espias.capi = []
  espias.respuestaCapi = { ok: true }
  espias.respuestaEmail = { ok: true, sent: 2, skipped: 0, failed: 0, errors: [] }
  espias.whatsapp = []
  espias.respuestaWhatsapp = { ok: true, skipped: false }
  espias.marcas = []
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  process.env.WHATSAPP_TEMPLATE_TASACION = 'tasacion_llamada_v1'
  delete process.env.WHATSAPP_TEMPLATE_TASACION_LANG
})

/**
 * El primer WhatsApp al cliente. Es el único aviso de esta cola que le llega a
 * una persona de afuera, y hasta el 2026-08-27 no tenía UN SOLO test.
 *
 * Eso permitió que viviera un bug callado: el handler mantenía a mano un
 * diccionario con el texto de las plantillas y terminaba en
 * `?? CUERPOS.tasacion_coordinar_util`. Al cambiar la plantilla sin tocar ese
 * mapa, el Inbox le mostraba al equipo el mensaje VIEJO como "lo que le dijimos
 * al cliente" — un mensaje que nadie recibió. Nada lo habría marcado.
 */
const WA = { funnel: 'tasacion', dealId: 'deal-1', contactId: 'contacto-1', nombre: 'Ana Pérez', phone: '11 2292-6434' }

describe('primer WhatsApp de tasación', () => {
  it('no sale en el embudo de la clase: ahí la entrega es la clase misma', async () => {
    const r = await ejecutarTrabajo('whatsapp', { ...WA, funnel: 'clase' })
    expect(r).toBe('skipped')
    expect(espias.whatsapp).toEqual([])
  })

  it('sin plantilla configurada no manda nada (el interruptor de estreno)', async () => {
    delete process.env.WHATSAPP_TEMPLATE_TASACION
    const r = await ejecutarTrabajo('whatsapp', WA)
    expect(r).toBe('skipped')
    expect(espias.whatsapp).toEqual([])
  })

  it('sin teléfono no hay a quién escribirle', async () => {
    const r = await ejecutarTrabajo('whatsapp', { ...WA, phone: null })
    expect(r).toBe('skipped')
    expect(espias.whatsapp).toEqual([])
  })

  it('un teléfono que WhatsApp no puede usar es skipped, no un error a reintentar', async () => {
    const r = await ejecutarTrabajo('whatsapp', { ...WA, phone: 'pepe' })
    expect(r).toBe('skipped')
    expect(espias.whatsapp).toEqual([])
  })

  it('manda la plantilla de la env var, al número normalizado y solo con el nombre de pila', async () => {
    const r = await ejecutarTrabajo('whatsapp', WA)
    expect(r).toBe('done')
    expect(espias.whatsapp).toHaveLength(1)
    expect(espias.whatsapp[0]).toMatchObject({
      to: '5491122926434',
      templateName: 'tasacion_llamada_v1',
      languageCode: 'es_AR',
      origen: 'landing',
      aiGenerated: true,
    })
    // Una sola variable: la plantilla tiene un solo {{1}}. Si algún día se manda
    // una con dos, Meta rechaza el envío por cantidad de parámetros.
    expect(espias.whatsapp[0].bodyParams).toEqual(['Ana'])
  })

  /**
   * EL INVARIANTE QUE IMPORTA. Sin `bodyText`, el texto del chat lo arma
   * `sendWhatsappTemplate` desde el catálogo generado en Meta
   * (`lib/integrations/whatsapp/cuerpos.ts`), que es la única fuente de verdad.
   * Volver a pasarlo desde acá reabre la puerta a mostrar un mensaje inventado.
   */
  it('NO decide por su cuenta el texto que el equipo va a leer en el Inbox', async () => {
    await ejecutarTrabajo('whatsapp', WA)
    expect(espias.whatsapp[0].bodyText).toBeUndefined()
  })

  /**
   * Y sacar ese diccionario NO cambia lo que se guarda hoy: para la plantilla
   * que está viva en Netlify, el catálogo aprobado produce EXACTAMENTE el mismo
   * texto que producía el mapa a mano. Este test es la prueba de que el deploy
   * es neutro — si alguna vez deja de serlo, se entera acá y no en el Inbox.
   */
  it('para la plantilla viva, el catálogo aprobado da el mismo texto que daba el mapa a mano', () => {
    expect(textoDePlantilla('tasacion_coordinar_v2', ['Ana'])).toBe(
      'Hola Ana, recibimos tu solicitud de tasación en nuestra web.\n\n' +
        'Para coordinar la visita, ¿cómo preferís que sigamos?',
    )
    expect(textoDePlantilla('tasacion_coordinar_util', ['Ana'])).toBe(
      'Hola Ana, ¿cómo estás?\n\n' +
        'Te escribo de Diego Ferreyra Inmobiliaria por la tasación gratuita que pediste recién en nuestra web.\n\n' +
        'Es presencial, sin costo y sin compromiso. ¿Cómo preferís que la coordinemos?',
    )
  })

  /**
   * El círculo completo del corte: con lo que el handler manda (nombre de
   * plantilla + un parámetro), el catálogo aprobado tiene que poder armar el
   * mensaje REAL. Si no puede, el chat del equipo muestra "Ana" pelado y nadie
   * sabe qué se le dijo al cliente.
   */
  it('lo que manda el handler alcanza para reconstruir el mensaje real de la plantilla nueva', async () => {
    await ejecutarTrabajo('whatsapp', WA)
    const { templateName, bodyParams } = espias.whatsapp[0] as { templateName: string; bodyParams: string[] }
    expect(textoDePlantilla(templateName, bodyParams)).toBe(
      'Hola Ana, ¡recibimos tu solicitud de tasación!\n\n' +
        'Te llamará Paula desde el número +54 9 11 2292-6434 para coordinarla\n\n' +
        'Seguimos en contacto',
    )
  })

  it('modo prueba / sin credenciales queda en skipped y no marca el trato', async () => {
    espias.respuestaWhatsapp = { ok: false, skipped: true }
    const r = await ejecutarTrabajo('whatsapp', WA)
    expect(r).toBe('skipped')
    expect(espias.marcas).toEqual([])
  })

  it('con el envío hecho, marca el trato como conversación DE TASACIÓN', async () => {
    await ejecutarTrabajo('whatsapp', WA)
    expect(espias.marcas).toEqual([
      { tabla: 'deals', patch: { tasacion_wa_state: {} }, id: 'deal-1' },
    ])
  })

  it('un límite de volumen de Meta se marca para que el worker espere largo', async () => {
    espias.respuestaWhatsapp = { ok: false, skipped: false, error: 'límite de mensajería', errorCode: 131048 }
    await expect(ejecutarTrabajo('whatsapp', WA)).rejects.toThrow('[LIMITE_META]')
  })

  it('un error común NO lleva esa marca: reintentar en 30 s sí tiene sentido', async () => {
    espias.respuestaWhatsapp = { ok: false, skipped: false, error: 'número inválido', errorCode: 131026 }
    await expect(ejecutarTrabajo('whatsapp', WA)).rejects.toThrow(/^(?!.*LIMITE_META).*número inválido/)
    expect(espias.marcas).toEqual([])
  })
})

describe('tarea de coordinación', () => {
  it('la crea con el título que ya usaba el sistema', async () => {
    const r = await ejecutarTrabajo('coordinator_task', {
      funnel: 'tasacion', dealId: 'deal-1', contactId: 'contacto-1', nombre: 'Ana Pérez',
    })
    expect(r).toBe('done')
    expect(espias.tareas[0]).toMatchObject({
      rol: 'coordinador',
      type: 'update_contact',
      title: 'Solicitud de tasación: Ana Pérez',
      deal_id: 'deal-1',
      contact_id: 'contacto-1',
    })
  })
})

describe('email al equipo', () => {
  it('una SOLICITUD de tasación usa su propia pieza, no la de tasación agendada', async () => {
    await ejecutarTrabajo('notify', { funnel: 'tasacion', dealId: 'deal-1' })
    expect(espias.tasacion).toEqual(['deal-1'])
    expect(espias.clase).toEqual([])
  })

  it('la clase gratuita usa la suya', async () => {
    await ejecutarTrabajo('notify', { funnel: 'clase', dealId: 'deal-2' })
    expect(espias.clase).toEqual(['deal-2'])
    expect(espias.tasacion).toEqual([])
  })

  it('un envío limpio queda en done', async () => {
    expect(await ejecutarTrabajo('notify', { funnel: 'tasacion', dealId: 'deal-1' })).toBe('done')
  })

  /**
   * A4 — el trabajo que NO PODÍA FALLAR.
   *
   * `sendEmail` nunca tira: devuelve `{ok,sent,failed,errors}`. Como las dos
   * piezas de notificación ignoraban ese resultado, un vencimiento de Resend
   * —el incidente del 2026-08-08 que originó la cola entera— salía de acá como
   * 'done': el trabajo quedaba hecho, sin reintento ni escalación, y
   * `SELECT status FROM funnel_lead_jobs` le mentía al operador.
   */
  it('si Resend vence, TIRA: el trabajo no puede quedar en done', async () => {
    espias.respuestaEmail = {
      ok: false, sent: 0, skipped: 0, failed: 2,
      errors: ['Tiempo de espera agotado: Resend no respondió en 8000 ms'],
    }
    await expect(
      ejecutarTrabajo('notify', { funnel: 'tasacion', dealId: 'deal-1' }),
    ).rejects.toThrow('Resend no respondió')
  })

  it('un envío PARCIAL (uno sí, otro no) también tira: la idempotencia es por destinatario', async () => {
    espias.respuestaEmail = { ok: false, sent: 1, skipped: 0, failed: 1, errors: ['550 mailbox unavailable'] }
    await expect(
      ejecutarTrabajo('notify', { funnel: 'clase', dealId: 'deal-2' }),
    ).rejects.toThrow('fallados: 1')
  })

  it('sin RESEND_API_KEY tira aunque `failed` sea 0 (no se mandó NADA)', async () => {
    // `sendEmail` sale temprano con ok:false y failed:0 cuando falta la clave.
    // Mirar solo `failed > 0` dejaría pasar el peor caso como 'done'.
    espias.respuestaEmail = {
      ok: false, sent: 0, skipped: 0, failed: 0,
      errors: ['RESEND_API_KEY not set; skipping email send'],
    }
    await expect(
      ejecutarTrabajo('notify', { funnel: 'tasacion', dealId: 'deal-1' }),
    ).rejects.toThrow('RESEND_API_KEY')
  })

  it('si ni se llegó a intentar (deal ilegible o sin destinatarios) tira: NO es un skipped', async () => {
    espias.respuestaEmail = null
    await expect(
      ejecutarTrabajo('notify', { funnel: 'tasacion', dealId: 'deal-1' }),
    ).rejects.toThrow('no se llegó a intentar')
  })

  it('un envío ya hecho antes (todo salteado por idempotencia) es done, no un fallo', async () => {
    espias.respuestaEmail = { ok: true, sent: 0, skipped: 2, failed: 0, errors: [] }
    expect(await ejecutarTrabajo('notify', { funnel: 'tasacion', dealId: 'deal-1' })).toBe('done')
  })
})

describe('Mailchimp', () => {
  it('con el interruptor apagado no llama a nadie y queda skipped', async () => {
    espias.mailchimpPrendido = false
    const r = await ejecutarTrabajo('mailchimp', { dealId: 'deal-1' })
    expect(r).toBe('skipped')
    expect(espias.mailchimp).toEqual([])
  })

  it('encendido, sincroniza', async () => {
    const r = await ejecutarTrabajo('mailchimp', { dealId: 'deal-1' })
    expect(r).toBe('done')
    expect(espias.mailchimp).toEqual(['deal-1'])
  })
})

describe('sesión anónima', () => {
  it('sin anonId no hay nada que vincular', async () => {
    const r = await ejecutarTrabajo('anon_stitch', { anonId: null, contactId: 'contacto-1' })
    expect(r).toBe('skipped')
    expect(espias.rpcs).toEqual([])
  })

  it('con anonId llama a la RPC del stitching', async () => {
    const r = await ejecutarTrabajo('anon_stitch', { anonId: 'anon-1', contactId: 'contacto-1' })
    expect(r).toBe('done')
    expect(espias.rpcs[0]).toEqual({
      nombre: 'link_anon_to_contact',
      args: { p_anon_id: 'anon-1', p_contact_id: 'contacto-1' },
    })
  })

  it('si la RPC falla, TIRA (para que el worker reintente)', async () => {
    espias.errorRpc = { message: 'rpc caída' }
    await expect(
      ejecutarTrabajo('anon_stitch', { anonId: 'anon-1', contactId: 'contacto-1' }),
    ).rejects.toThrow('rpc caída')
  })
})

describe('evento de conversión a Meta', () => {
  const PAYLOAD = {
    funnel: 'tasacion',
    eventId: 'evt-1',
    eventSourceUrl: 'https://inmobiliariadiegoferreyra.com/tasacion-directa',
    eventTimeUnixSeconds: 1_770_000_000,
    contentName: 'Tasación Directa',
    nombre: 'Ana Pérez',
    email: 'ana@ejemplo.com',
    phone: '+5491133445566',
    propertyLocation: 'Palermo',
    contactId: 'contacto-1',
    fbp: 'fb.1.2.3',
    fbc: null,
    ip: '200.10.20.30',
    userAgent: 'Mozilla/5.0',
  }

  it('manda CompleteRegistration con la hora REAL de la conversión', async () => {
    const r = await ejecutarTrabajo('capi', PAYLOAD)
    expect(r).toBe('done')
    expect(espias.capi[0]).toMatchObject({
      eventName: 'CompleteRegistration',
      eventId: 'evt-1',
      eventTimeUnixSeconds: 1_770_000_000,
    })
  })

  it('parte el nombre y manda los datos de match que pide Meta', async () => {
    await ejecutarTrabajo('capi', PAYLOAD)
    expect(espias.capi[0].userData).toMatchObject({
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@ejemplo.com',
      city: 'Palermo',
      externalId: 'contacto-1',
      clientIpAddress: '200.10.20.30',
      clientUserAgent: 'Mozilla/5.0',
    })
  })

  it('la clase gratuita no manda ciudad (no hay propiedad)', async () => {
    await ejecutarTrabajo('capi', { ...PAYLOAD, funnel: 'clase' })
    expect((espias.capi[0].userData as Record<string, unknown>).city).toBeNull()
  })

  it('sin event_id del Píxel no hay evento que deduplicar', async () => {
    const r = await ejecutarTrabajo('capi', { ...PAYLOAD, eventId: null })
    expect(r).toBe('skipped')
    expect(espias.capi).toEqual([])
  })

  it('si Meta lo rechaza, TIRA: una conversión perdida empeora la optimización de los adsets', async () => {
    espias.respuestaCapi = { ok: false, error: 'Invalid access token' }
    await expect(ejecutarTrabajo('capi', PAYLOAD)).rejects.toThrow('Invalid access token')
  })
})

describe('payload roto', () => {
  it('un trabajo sin los datos mínimos tira en vez de fingir que hizo algo', async () => {
    await expect(ejecutarTrabajo('notify', { funnel: 'tasacion' })).rejects.toThrow('dealId')
  })
})
