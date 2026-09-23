/**
 * Tests del POST del webhook de WhatsApp — foco en el PRESUPUESTO DE TIEMPO del
 * request y en el fail-closed del pipeline de IA.
 *
 * Contexto de por qué existen: Meta AGRUPA eventos, así que un solo POST puede
 * traer mensajes de varios teléfonos. El techo de 12s que se le puso al modelo
 * es POR LLAMADA — dos teléfonos son dos llamadas, más la descarga de adjuntos,
 * más el envío del agente. Netlify corta a los ~26s y `maxDuration` no aplica
 * (es de Vercel). Si el POST se pasa, Meta no recibe el 200, reintenta en loop
 * y puede DESHABILITAR el webhook: se dejan de recibir TODOS los mensajes
 * entrantes, no solo los del agente.
 *
 * La regla que verifican estos tests: guardar el mensaje del cliente es sagrado
 * y NUNCA se saltea; lo que se saltea cuando no hay tiempo es el análisis de IA
 * (que se recupera solo en el próximo mensaje entrante, porque el pipeline se
 * dispara por mensaje entrante).
 *
 * Solo se moquea lo que toca el mundo real (Supabase, descarga de adjuntos, IA).
 * La firma HMAC se calcula de verdad: `verifySignature` corre sin moquear.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'

const APP_SECRET = 'secreto-de-prueba'

const { db, ai, reloj, reinicio } = vi.hoisted(() => ({
  /** Lo que recibió cada pieza del reinicio de prueba, en orden. */
  reinicio: {
    reiniciar: [] as Array<{ phone: string; propertyId: string | null }>,
    preparar: [] as Array<{ phone: string; nombre: string | null }>,
    apertura: [] as Array<{ phone: string; propertyId: string; leadId: string | null }>,
    textos: [] as Array<{ to: string; text: string; propertyId: string | null }>,
    /** `false` simula un teléfono que NO está en la lista de prueba. */
    autorizado: true,
  },
  db: {
    upserts: [] as Array<Record<string, unknown>>,
    leads: [] as Array<Record<string, unknown>>,
    /** `wa_message_id` de cada lookup de estado (lo hace `persistStatus`). */
    statusLookups: [] as string[],
    /**
     * Traza de eventos en ORDEN de ejecución (`status:*` y `analisis:*`). Sirve
     * para asertar que los estados de entrega se procesan ANTES del pipeline de
     * IA: son 2 roundtrips baratos y no tienen por qué quedar detrás de una
     * llamada al modelo que puede comerse el request entero.
     */
    traza: [] as string[],
    /**
     * Simula el peor caso del punto 2: `createClient` revienta (falta una env
     * var, por ejemplo). Antes esa excepción salía por fuera de todo try/catch
     * y el payload auténtico se llevaba un 500.
     */
    explotaCreateClient: false,
  },
  ai: {
    /** Teléfonos con los que se llamó a `runConversationAnalysis`, en orden. */
    analisis: [] as string[],
    /** Inputs con los que se llamó a `runSchedulingAgent`, en orden. */
    agente: [] as Array<Record<string, unknown>>,
    /** Cuánto "tarda" cada análisis (avanza el reloj falso). */
    duracionAnalisisMs: 0,
    /** Qué devuelve el análisis. */
    resultado: {
      state: {
        phone_e164: '',
        summary: '',
        last_analyzed_message_id: null,
        last_analyzed_at: null,
        intent: 'otro',
        priority_score: 0,
        priority_reason: null,
        suggested_next_step: null,
        agent_messages_sent: 1,
        agent_handed_off: false,
        tokens_used_total: 0,
        analyses_count: 1,
        created_at: '2026-08-03T10:00:00.000Z',
        updated_at: '2026-08-03T10:00:00.000Z',
      } as Record<string, unknown> | null,
      analyzed: true,
      readFailed: false,
      wantsToSchedule: true,
      proposedSlot: null as string | null,
    },
  },
  reloj: {
    /** Reloj falso en ms. Lo mueven los mocks para simular latencia sin esperar. */
    ahora: 1_700_000_000_000,
    /** Cuánto "tarda" la descarga de un adjunto. */
    duracionMediaMs: 0,
  },
}))

vi.mock('@supabase/supabase-js', () => {
  // Query builder mínimo y encadenable. `property_leads` devuelve `db.leads`
  // (vacío por default: el mensaje se guarda igual con `lead_id` en NULL) y los
  // upserts sobre `whatsapp_messages` se registran para poder asertar que NINGÚN
  // mensaje entrante se perdió.
  function builder(table: string) {
    const q: Record<string, unknown> = {}
    const self = () => q
    let ultimoEq: unknown = null
    q.select = self
    q.not = self
    q.is = self
    q.ilike = self
    q.order = self
    q.limit = self
    q.eq = (_col: string, val: unknown) => {
      ultimoEq = val
      return q
    }
    q.update = self
    q.upsert = (row: Record<string, unknown>) => {
      if (table === 'whatsapp_messages') db.upserts.push(row)
      // El código real encadena `.select('id')` sobre el upsert: con
      // `ignoreDuplicates`, que devuelva fila o no es la señal de "este mensaje
      // es NUEVO" que hace idempotente al pipeline de IA (2026-08-16). El
      // simulador tiene que ofrecer ese eslabón; sin él, `persistInbound`
      // explotaba con "upsert(...).select is not a function" y el pipeline nunca
      // corría. No se notaba porque este archivo entero no cargaba desde que
      // `server-only` entró a la cadena de imports.
      const fila = { data: [{ id: `msg-${db.upserts.length}` }], error: null }
      return Object.assign(Promise.resolve({ error: null }), { select: () => Promise.resolve(fila) })
    }
    q.maybeSingle = () => {
      // El único `maybeSingle` sobre `whatsapp_messages` de esta ruta es el que
      // hace `persistStatus` para leer el estado actual del mensaje saliente.
      if (table === 'whatsapp_messages') {
        db.statusLookups.push(String(ultimoEq))
        db.traza.push(`status:${String(ultimoEq)}`)
      }
      return Promise.resolve({ data: null, error: null })
    }
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: table === 'property_leads' ? db.leads : [], error: null }).then(resolve, reject)
    return q
  }
  return {
    createClient: () => {
      if (db.explotaCreateClient) throw new Error('falta SUPABASE_SERVICE_ROLE_KEY')
      return { from: (table: string) => builder(table) }
    },
  }
})

vi.mock('@/lib/integrations/whatsapp/media', () => ({
  downloadAndStoreInboundMedia: vi.fn(async () => {
    reloj.ahora += reloj.duracionMediaMs
    return null
  }),
}))

vi.mock('@/lib/ai/analyze-conversation', () => ({
  runConversationAnalysis: vi.fn(async (phoneE164: string) => {
    ai.analisis.push(phoneE164)
    db.traza.push(`analisis:${phoneE164}`)
    reloj.ahora += ai.duracionAnalisisMs
    return ai.resultado
  }),
}))

vi.mock('@/lib/ai/scheduling-agent', () => ({
  runSchedulingAgent: vi.fn(async (input: Record<string, unknown>) => {
    ai.agente.push(input)
    db.traza.push(`agente:${String(input.phoneE164)}`)
    reloj.ahora += ai.duracionAnalisisMs
    return { action: 'noop' }
  }),
}))

// El reinicio de prueba se moquea en sus BORDES (los que tocan la base y Meta),
// pero `esPalabraDeReinicio` y `PROPIEDAD_DE_LA_PRUEBA` quedan REALES: lo que se
// prueba acá es justamente con qué propiedad los llama el webhook.
vi.mock('@/lib/ai/reset-prueba', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/reset-prueba')>()
  return {
    ...real,
    reiniciarPrueba: vi.fn(async (phone: string, propertyId: string | null) => {
      reinicio.reiniciar.push({ phone, propertyId })
      return reinicio.autorizado
        ? { reiniciado: true, motivo: 'reiniciado', limpiado: ['la memoria y el contador de mensajes'] }
        : { reiniciado: false, motivo: 'este teléfono no está en la lista de prueba', limpiado: [] }
    }),
    prepararConsultaDePrueba: vi.fn(async (phone: string, nombre: string | null) => {
      reinicio.preparar.push({ phone, nombre })
      return { propertyId: real.PROPIEDAD_DE_LA_PRUEBA.id, leadId: 'lead-de-la-prueba' }
    }),
    reenviarApertura: vi.fn(async (phone: string, propertyId: string, leadId: string | null) => {
      reinicio.apertura.push({ phone, propertyId, leadId })
      return { ok: true, detalle: 'plantilla consulta_plano' }
    }),
  }
})

vi.mock('@/lib/integrations/whatsapp/core', () => ({
  sendWhatsappText: vi.fn(async (input: { to: string; text: string; propertyId?: string | null }) => {
    reinicio.textos.push({ to: input.to, text: input.text, propertyId: input.propertyId ?? null })
    return { ok: true, skipped: false }
  }),
}))

import { POST } from './route'
import { PROPIEDAD_DE_LA_PRUEBA } from '@/lib/ai/reset-prueba'

function mensaje(opts: { id: string; from: string; nombre: string; imagen?: boolean; texto?: string }) {
  const raw: Record<string, unknown> = {
    id: opts.id,
    from: opts.from,
    timestamp: '1754215200',
    type: opts.imagen ? 'image' : 'text',
  }
  if (opts.imagen) raw.image = { id: `media-${opts.id}`, mime_type: 'image/jpeg' }
  else raw.text = { body: opts.texto ?? 'hola, me interesa' }
  return { raw, contacto: { profile: { name: opts.nombre }, wa_id: opts.from } }
}

/**
 * Arma UN change con N mensajes (así es como Meta agrupa varios eventos en un
 * POST) y, opcionalmente, un change con actualizaciones de estado — Meta las
 * manda en changes aparte pero dentro del MISMO POST.
 */
function payload(msgs: Array<ReturnType<typeof mensaje>>, statusIds: string[] = []) {
  const changes: Array<Record<string, unknown>> = [
    {
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        contacts: msgs.map((m) => m.contacto),
        messages: msgs.map((m) => m.raw),
      },
    },
  ]
  if (statusIds.length) {
    changes.push({
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        statuses: statusIds.map((id) => ({ id, status: 'delivered', timestamp: '1754215200' })),
      },
    })
  }
  return { object: 'whatsapp_business_account', entry: [{ id: 'waba-1', changes }] }
}

function request(body: unknown, opts: { firmaValida?: boolean } = {}) {
  const raw = JSON.stringify(body)
  const firma =
    opts.firmaValida === false
      ? 'sha256=' + createHmac('sha256', 'otro-secreto').update(raw, 'utf8').digest('hex')
      : 'sha256=' + createHmac('sha256', APP_SECRET).update(raw, 'utf8').digest('hex')
  return new Request('https://app.test/api/webhooks/whatsapp', {
    method: 'POST',
    body: raw,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
}

const TEL_A = '5491122334455'
const TEL_B = '5491133445566'

beforeEach(() => {
  db.upserts = []
  db.leads = [
    { id: 'lead-A', phone: `+${TEL_A}`, property_id: 'prop-1', created_at: '2026-08-01T00:00:00Z' },
    { id: 'lead-B', phone: `+${TEL_B}`, property_id: 'prop-1', created_at: '2026-08-01T00:00:00Z' },
  ]
  db.statusLookups = []
  db.traza = []
  db.explotaCreateClient = false
  reinicio.reiniciar = []
  reinicio.preparar = []
  reinicio.apertura = []
  reinicio.textos = []
  reinicio.autorizado = true
  ai.analisis = []
  ai.agente = []
  ai.duracionAnalisisMs = 0
  ai.resultado.analyzed = true
  ai.resultado.wantsToSchedule = true
  ai.resultado.state = {
    phone_e164: '',
    summary: '',
    last_analyzed_message_id: null,
    last_analyzed_at: null,
    intent: 'otro',
    priority_score: 0,
    priority_reason: null,
    suggested_next_step: null,
    agent_messages_sent: 1,
    agent_handed_off: false,
    tokens_used_total: 0,
    analyses_count: 1,
    created_at: '2026-08-03T10:00:00.000Z',
    updated_at: '2026-08-03T10:00:00.000Z',
  }
  reloj.ahora = 1_700_000_000_000
  reloj.duracionMediaMs = 0
  process.env.WHATSAPP_APP_SECRET = APP_SECRET
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-prueba'
  // El presupuesto se mide con `Date.now()`; el reloj falso deja simular 20s de
  // latencia sin que el test tarde 20s.
  vi.spyOn(Date, 'now').mockImplementation(() => reloj.ahora)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/webhooks/whatsapp — presupuesto de tiempo del request', () => {
  it('dos teléfonos distintos en un POST: los DOS mensajes se guardan y el pipeline de IA corre UNA sola vez', async () => {
    // Análisis instantáneo a propósito: aunque SOBRE presupuesto, el pipeline
    // sigue siendo uno solo por POST. Encadenar dos llamadas al modelo en un
    // request es justo lo que la regla dura de CLAUDE.md prohíbe.
    ai.duracionAnalisisMs = 0

    const res = await POST(
      request(
        payload([
          mensaje({ id: 'wamid.A', from: TEL_A, nombre: 'Ana' }),
          mensaje({ id: 'wamid.B', from: TEL_B, nombre: 'Bruno' }),
        ]),
      ),
    )

    expect(res.status).toBe(200)
    // SAGRADO: los dos mensajes del cliente quedaron guardados.
    expect(db.upserts.map((u) => u.wa_message_id).sort()).toEqual(['wamid.A', 'wamid.B'])
    // Un solo turno de agente, y es el del ÚLTIMO entrante del lote. El otro
    // teléfono se atiende cuando llegue su propio webhook. (La llamada al
    // modelo ya no la hace el webhook: la hace el agente por dentro, con el
    // contexto de la propiedad — por eso `ai.analisis` queda vacío acá.)
    expect(ai.agente).toHaveLength(1)
    expect(ai.agente[0].phoneE164).toBe(TEL_B)
  })

  it('los estados de entrega se procesan aunque el presupuesto de IA esté agotado', async () => {
    // La descarga del adjunto se come el presupuesto: el análisis no arranca,
    // pero los estados —2 roundtrips baratos— tienen que quedar al día igual.
    reloj.duracionMediaMs = 20_000

    const res = await POST(
      request(
        payload([mensaje({ id: 'wamid.IMG', from: TEL_A, nombre: 'Ana', imagen: true })], ['wamid.OUT-1']),
      ),
    )

    expect(res.status).toBe(200)
    expect(db.statusLookups).toEqual(['wamid.OUT-1'])
    expect(ai.analisis).toHaveLength(0)
  })

  it('con 2s ya consumidos por la fase 1, el pipeline NO arranca (el gate es de 1s, no de 9s)', async () => {
    // Ancla la recalibración del presupuesto: el peor caso de UN pipeline con
    // los techos reales (12s del modelo + 8s del envío por Meta + un mail sin
    // techo) no entra en los ~26s de Netlify si el request ya gastó 2s.
    reloj.duracionMediaMs = 2_000

    const res = await POST(request(payload([mensaje({ id: 'wamid.IMG', from: TEL_A, nombre: 'Ana', imagen: true })])))

    expect(res.status).toBe(200)
    expect(db.upserts).toHaveLength(1) // el mensaje se guardó igual
    expect(ai.analisis).toHaveLength(0)
  })

  it('los estados de entrega se procesan ANTES del pipeline de IA', async () => {
    const res = await POST(
      request(payload([mensaje({ id: 'wamid.A', from: TEL_A, nombre: 'Ana' })], ['wamid.OUT-1'])),
    )

    expect(res.status).toBe(200)
    expect(db.traza).toEqual([`status:wamid.OUT-1`, `agente:${TEL_A}`])
  })

  it('presupuesto agotado ANTES del primer análisis: los mensajes igual se guardan y el POST devuelve 200', async () => {
    // La descarga del adjunto se come el presupuesto entero (Meta da hasta 8s
    // para la URL + 8s para el binario, más la subida a Storage).
    reloj.duracionMediaMs = 20_000

    const res = await POST(request(payload([mensaje({ id: 'wamid.IMG', from: TEL_A, nombre: 'Ana', imagen: true })])))

    expect(res.status).toBe(200)
    expect(db.upserts.map((u) => u.wa_message_id)).toEqual(['wamid.IMG'])
    expect(ai.analisis).toHaveLength(0)
    expect(ai.agente).toHaveLength(0)
  })

  it('dos mensajes del MISMO teléfono: se guardan los dos, pero el análisis corre una sola vez y sobre el ÚLTIMO', async () => {
    await POST(
      request(
        payload([
          mensaje({ id: 'wamid.1', from: TEL_A, nombre: 'Ana' }),
          mensaje({ id: 'wamid.2', from: TEL_A, nombre: 'Ana Segunda' }),
        ]),
      ),
    )

    expect(db.upserts.map((u) => u.wa_message_id)).toEqual(['wamid.1', 'wamid.2'])
    expect(ai.agente).toHaveLength(1)
    // El contexto que se analiza es el del ÚLTIMO mensaje (el más informativo).
    expect(ai.agente[0].contactName).toBe('Ana Segunda')
  })
})

describe('POST /api/webhooks/whatsapp — fail-closed del pipeline de IA', () => {
  it('con el ANÁLISIS APAGADO, el mensaje entrante igual se guarda, el agente no corre y responde 200', async () => {
    // El interruptor `ai_agent_settings.analysis_enabled` (migración
    // 20260803000006) vive adentro de `analyzeConversation`, o sea del otro lado
    // de este mock: apagado, `runConversationAnalysis` devuelve `analyzed:false`.
    // Lo que este test fija es el contrato del WEBHOOK ante ese caso — el único
    // que le importa a Meta: guardar el mensaje del cliente es sagrado y pasa
    // igual, y el bot no le escribe a nadie.
    ai.resultado.analyzed = false
    ai.resultado.wantsToSchedule = false

    const res = await POST(request(payload([mensaje({ id: 'wamid.A', from: TEL_A, nombre: 'Ana' })])))

    expect(res.status).toBe(200)
    expect(db.upserts.map((u) => u.wa_message_id)).toEqual(['wamid.A'])
  })

  it('sin propiedad asociada, solo se analiza: el agente no se invoca', async () => {
    // Sin propiedad no hay datos que contestar, y un agente que improvisa es
    // peor que uno callado. Se analiza igual para ordenar la bandeja.
    db.leads = []

    const res = await POST(request(payload([mensaje({ id: 'wamid.A', from: TEL_A, nombre: 'Ana' })])))

    expect(res.status).toBe(200)
    expect(db.upserts).toHaveLength(1)
    expect(ai.analisis).toHaveLength(1)
    expect(ai.agente).toHaveLength(0)
  })

  it('el agente recibe el contexto resuelto del mensaje (teléfono, lead y propiedad)', async () => {
    // Los contadores del agente YA NO viajan por acá: los lee el propio agente
    // de `conversation_ai_state`, y falla cerrado si no puede. Pasarlos desde
    // el webhook era el camino por el que un hipo de lectura se convertía en
    // "0 mensajes, sin derivar" y el agente le escribía a alguien ya derivado.
    await POST(request(payload([mensaje({ id: 'wamid.A', from: TEL_A, nombre: 'Ana' })])))

    expect(ai.agente).toHaveLength(1)
    expect(ai.agente[0].phoneE164).toBe(TEL_A)
    expect(ai.agente[0].propertyId).toBeTruthy()
    expect(ai.agente[0].contactName).toBe('Ana')
  })
})

describe('POST /api/webhooks/whatsapp — contrato de respuesta', () => {
  it('una excepción inesperada dentro del handler devuelve 200, no 500', async () => {
    // `admin()` revienta (falta una env var). Un 500 acá hace que Meta reintente
    // en loop el MISMO payload roto y puede terminar deshabilitando el webhook:
    // se dejan de recibir TODOS los mensajes entrantes.
    db.explotaCreateClient = true

    const res = await POST(request(payload([mensaje({ id: 'wamid.A', from: TEL_A, nombre: 'Ana' })])))

    expect(res.status).toBe(200)
  })

  it('firma inválida sigue devolviendo 403 y no escribe nada', async () => {
    const res = await POST(
      request(payload([mensaje({ id: 'wamid.A', from: TEL_A, nombre: 'Ana' })]), { firmaValida: false }),
    )

    expect(res.status).toBe(403)
    expect(db.upserts).toHaveLength(0)
    expect(ai.analisis).toHaveLength(0)
  })
})

/**
 * La palabra de reinicio arranca una prueba del agente. Estos tests fijan LO
 * QUE COSTÓ EL BUG del 2026-09-23: la prueba usaba la propiedad de la
 * conversación —que sale del lead más reciente del teléfono— y terminaba
 * hablando de una propiedad de otro ensayo. Ahora es fija (Roque Pérez), y esto
 * es lo único que impide que alguien la vuelva a atar a la conversación sin que
 * ninguna prueba se entere: los dos parámetros son `string | null` y TypeScript
 * no nota la diferencia.
 */
describe('POST /api/webhooks/whatsapp — la palabra de reinicio', () => {
  it('reinicia y abre SIEMPRE con la propiedad de la prueba, aunque la conversación sea de otra', async () => {
    // El lead del teléfono apunta a otra propiedad, como pasó de verdad.
    db.leads = [{ id: 'lead-A', phone: `+${TEL_A}`, property_id: 'prop-de-otra-prueba', created_at: '2026-09-15T14:07:00Z' }]

    const res = await POST(request(payload([mensaje({ id: 'wamid.R', from: TEL_A, nombre: 'Diego', texto: 'reiniciar' })])))
    const body = await res.json()

    expect(body.reiniciado).toBe(true)
    expect(reinicio.reiniciar[0].propertyId).toBe(PROPIEDAD_DE_LA_PRUEBA.id)
    expect(reinicio.apertura[0].propertyId).toBe(PROPIEDAD_DE_LA_PRUEBA.id)
    expect(reinicio.apertura[0].propertyId).not.toBe('prop-de-otra-prueba')
  })

  it('el mensaje entrante se guarda igual y ese turno NO se analiza', async () => {
    // Analizarlo volvería a llenar la memoria que se acaba de vaciar.
    await POST(request(payload([mensaje({ id: 'wamid.R2', from: TEL_A, nombre: 'Diego', texto: 'Reiniciar.' })])))

    expect(db.upserts.map(u => u.wa_message_id)).toEqual(['wamid.R2'])
    expect(ai.analisis).toHaveLength(0)
    expect(ai.agente).toHaveLength(0)
  })

  it('primero la confirmación y después la apertura, para que el chat se lea en orden', async () => {
    await POST(request(payload([mensaje({ id: 'wamid.R3', from: TEL_A, nombre: 'Diego', texto: 'reiniciar' })])))

    expect(reinicio.textos).toHaveLength(1)
    expect(reinicio.textos[0].text).toContain('arranca de cero')
    // La confirmación también queda archivada bajo la propiedad de la prueba.
    expect(reinicio.textos[0].propertyId).toBe(PROPIEDAD_DE_LA_PRUEBA.id)
    expect(reinicio.apertura).toHaveLength(1)
  })

  it('un teléfono que NO está en la lista de prueba no reinicia nada: se le contesta como a un cliente', async () => {
    reinicio.autorizado = false

    const res = await POST(request(payload([mensaje({ id: 'wamid.R4', from: TEL_A, nombre: 'Curioso', texto: 'reiniciar' })])))
    const body = await res.json()

    expect(body.reiniciado).toBeUndefined()
    // Nada de escribir en la base ni de mandar mensajes antes del permiso.
    expect(reinicio.preparar).toHaveLength(0)
    expect(reinicio.textos).toHaveLength(0)
    expect(reinicio.apertura).toHaveLength(0)
    // Y el agente lo atiende como a cualquiera.
    expect(ai.agente).toHaveLength(1)
  })
})
