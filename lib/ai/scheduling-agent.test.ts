import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseProposedSlot,
  dayWord,
  decideSchedulingAction,
  buildAskWhenMessage,
  buildAskTimeMessage,
  buildConfirmMessage,
  buildHandoffNote,
  AGENT_NOTE_STATUSES,
  AGENT_NOTE_STATUS_PREFIX,
  type SchedulingContext,
} from './scheduling-agent'

// Lunes 2026-08-03 12:00 UTC = mediodía en Argentina — ancla estable para
// todos los tests de fecha (nunca cruza de día por TZ).
const LUNES = new Date('2026-08-03T12:00:00Z')

// ---------------------------------------------------------------------------
// parseProposedSlot — pura, sin red.
// ---------------------------------------------------------------------------
describe('parseProposedSlot', () => {
  it('"mañana a la tarde" → mañana (martes) + tarde', () => {
    expect(parseProposedSlot('mañana a la tarde', LUNES)).toEqual({ dateISO: '2026-08-04', franja: 'tarde' })
  })

  it('sin acento también funciona: "manana a la tarde"', () => {
    expect(parseProposedSlot('manana a la tarde', LUNES)).toEqual({ dateISO: '2026-08-04', franja: 'tarde' })
  })

  it('"el sábado a las 10" → próximo sábado + mañana (10hs cae en el bucket manana)', () => {
    // Lunes 3/8 → el próximo sábado es el 8/8.
    // La hora dicha por el cliente se conserva: se guarda 10, no las 9 por
    // default de la franja mañana.
    expect(parseProposedSlot('el sábado a las 10', LUNES)).toEqual({ dateISO: '2026-08-08', franja: 'manana', hora: 10 })
  })

  it('"pasado mañana por la mañana" → +2 días + mañana', () => {
    expect(parseProposedSlot('pasado mañana por la mañana', LUNES)).toEqual({ dateISO: '2026-08-05', franja: 'manana' })
  })

  it('weekday + mediodía: "el jueves al mediodía"', () => {
    expect(parseProposedSlot('el jueves al mediodía', LUNES)).toEqual({ dateISO: '2026-08-06', franja: 'mediodia' })
  })

  it('si el weekday nombrado es HOY, salta a la semana que viene (nunca agenda para hoy)', () => {
    // LUNES es lunes — pedir "el lunes" debe resolver al lunes siguiente, no hoy.
    expect(parseProposedSlot('el lunes a la tarde', LUNES)).toEqual({ dateISO: '2026-08-10', franja: 'tarde' })
  })

  it('texto ambiguo sin día reconocible → null (nunca adivina)', () => {
    expect(parseProposedSlot('en cualquier momento', LUNES)).toBeNull()
  })

  it('"hoy a la tarde" → null (el sistema nunca agenda para el mismo día)', () => {
    expect(parseProposedSlot('hoy a la tarde', LUNES)).toBeNull()
  })

  it('día SIN momento devuelve el día solo — el agente pregunta únicamente la hora', () => {
    // "Mañana" es literalmente lo que contesta la gente (caso real de la prueba
    // del dueño). Lo que NO puede pasar es confirmar una hora que no dijo.
    expect(parseProposedSlot('mañana', LUNES)).toEqual({ dateISO: '2026-08-04' })
  })

  it('franja reconocible pero SIN día → null', () => {
    expect(parseProposedSlot('a la tarde', LUNES)).toBeNull()
  })

  it('null/"" no explota', () => {
    expect(parseProposedSlot('', LUNES)).toBeNull()
  })

  // Las cuatro familias de frases donde el parser CONFIRMABA un día u horario
  // que el cliente no había pedido. Salieron de correr el parser real contra
  // 118 frases de castellano rioplatense; son las que le llegaban al cliente
  // como "Anoté tu visita para …". Todas tienen que preguntar, no confirmar.
  it.each([
    'el jueves te confirmo más tarde',
    'más tarde te digo, quizá el martes',
    'se me hizo tarde, ¿el viernes?',
    'el lunes, tarde o temprano',
    'llego tarde el martes',
    'mañana, más tarde te confirmo la hora',
    'me viene bien el jueves, pero llego un poco tarde',
    'el martes, aviso más tarde la hora',
    'perdón por contestar tarde, el jueves',
  ])('"tarde" como adverbio no es la franja de la tarde: %s', (frase) => {
    // La garantía es que no se CONFIRME la tarde. Que reconozca el día es
    // deseable: el agente pregunta la hora en vez de repetir todo.
    expect(parseProposedSlot(frase, LUNES)?.franja).toBeUndefined()
  })

  it.each([
    'mañana o pasado a la tarde',
    'pasado o el viernes a la tarde',
  ])('un "pasado" suelto es un día que no podemos resolver: %s', (frase) => {
    expect(parseProposedSlot(frase, LUNES)).toBeNull()
  })

  it.each([
    'la semana que viene, el martes a la tarde',
    'el martes que viene a la tarde',
    'el jueves de la semana que viene a la tarde',
    'el martes de la otra semana a la tarde',
    'dentro de 15 días, el jueves a la tarde',
  ])('otra semana: confirmaba el día de ESTA semana, una semana antes: %s', (frase) => {
    expect(parseProposedSlot(frase, LUNES)).toBeNull()
  })

  it.each(['el jueves a las 8', 'a las 8 el jueves'])(
    '"a las 8" es tan ambiguo como "a las 7" (8am/8pm): %s',
    (frase) => {
      expect(parseProposedSlot(frase, LUNES)).toBeNull()
    },
  )

  // Contrapartes: lo que SÍ tiene que seguir confirmando. Sin esto, los
  // arreglos de arriba podrían haber dejado al agente mudo para todo.
  it('un "tarde" adverbial NO tapa la franja dicha con preposición', () => {
    expect(parseProposedSlot('llego un poco tarde, el martes a la tarde', LUNES)).toEqual({
      dateISO: '2026-08-04',
      franja: 'tarde',
    })
  })

  it('"a las 8 de la mañana" sigue andando: la franja la fija "de la mañana", no el número', () => {
    expect(parseProposedSlot('el jueves a las 8 de la mañana', LUNES)).toEqual({
      dateISO: '2026-08-06',
      franja: 'manana',
    })
  })

  it('"pasado mañana" completo sigue resolviendo', () => {
    expect(parseProposedSlot('pasado mañana a la tarde', LUNES)).toEqual({
      dateISO: '2026-08-05',
      franja: 'tarde',
    })
  })
})

/**
 * El peor bug posible de esta pieza: el parser leía "manana" + "a la tarde"
 * dentro de un "NO puedo mañana a la tarde" y el agente contestaba "Anoté tu
 * visita para mañana por la tarde" — le agendaba justo el momento que el
 * cliente acababa de descartar. El prompt del análisis pide el slot "textual tal
 * cual lo dijo", así que la negación llega entera hasta acá.
 *
 * Ante negación NUNCA se confirma: `null` hace que el agente vuelva a ofrecer
 * franjas concretas, que es lo que corresponde responderle a un "no puedo".
 */
describe('parseProposedSlot — negaciones (nunca confirma lo que el cliente descartó)', () => {
  it.each([
    'no puedo mañana a la tarde',
    'mañana a la tarde no puedo',
    'no me sirve el martes a la tarde',
    'no me viene bien mañana a la mañana',
    'no llego el jueves al mediodía',
    'no voy a poder mañana a la tarde',
    'imposible el jueves a la tarde',
    'ni el martes ni el miércoles a la tarde',
    'cualquier día menos el jueves a la tarde',
    'salvo el viernes, cualquiera a la tarde',
    'tampoco puedo el jueves a la tarde',
    'nunca puedo el martes a la tarde',
    'prefiero que no sea mañana a la tarde',
  ])('"%s" → null', texto => {
    expect(parseProposedSlot(texto, LUNES)).toBeNull()
  })

  it('mixta ("el martes no, el miércoles sí") → null: resolver eso es un juicio, y este parser no juzga', () => {
    expect(parseProposedSlot('el martes no, el miércoles sí a la tarde', LUNES)).toBeNull()
  })

  it('"más o menos" NO es una negación: sigue siendo un horario válido', () => {
    // La palabra "menos" descarta, pero la locución no. Si esto devolviera null,
    // estaríamos volviendo a preguntar un día que el cliente ya eligió.
    expect(parseProposedSlot('mañana a la tarde, más o menos', LUNES)).toEqual({ dateISO: '2026-08-04', franja: 'tarde' })
  })
})

/**
 * El otro modo de confirmar algo que el cliente no dijo: mapear a una franja un
 * momento que ninguna franja cubre. `FRANJA_HORA` solo conoce mañana (9),
 * mediodía (12) y tarde (15).
 */
describe('parseProposedSlot — momentos sin franja posible', () => {
  it('"el jueves a las 9 de la noche" → null (antes leía el 9 y confirmaba jueves a la MAÑANA)', () => {
    expect(parseProposedSlot('el jueves a las 9 de la noche', LUNES)).toBeNull()
  })

  it.each(['mañana a la noche', 'el jueves a las 21', 'mañana a las 23', 'mañana a las 3 de la madrugada'])(
    '"%s" → null',
    texto => {
      expect(parseProposedSlot(texto, LUNES)).toBeNull()
    },
  )

  it('"mañana a las 7" → null: sin aclarar, 7 tanto puede ser de la mañana como de la tarde', () => {
    expect(parseProposedSlot('mañana a las 7', LUNES)).toBeNull()
  })

  it('cuando el cliente SÍ aclara, manda la franja nombrada y no la hora suelta', () => {
    expect(parseProposedSlot('mañana a las 5 de la tarde', LUNES)).toEqual({ dateISO: '2026-08-04', franja: 'tarde' })
  })

  it('un saludo no elige la franja: "buenas tardes, el jueves" → null', () => {
    expect(parseProposedSlot('buenas tardes, el jueves', LUNES)?.franja).toBeUndefined()
  })

  it('...y tampoco arruina un slot bueno: "buenas noches, mañana a la tarde" sigue siendo válido', () => {
    expect(parseProposedSlot('buenas noches, mañana a la tarde', LUNES)).toEqual({
      dateISO: '2026-08-04',
      franja: 'tarde',
    })
  })
})

/**
 * Tercer modo: el cliente puso VARIAS opciones sobre la mesa. Elegir una por él
 * es confirmarle algo que no dijo — antes ganaba la primera de `WEEKDAYS`, que
 * ni siquiera es la que el cliente nombró primero.
 */
describe('parseProposedSlot — varias opciones sobre la mesa', () => {
  it('"el martes o el jueves a la tarde" → null', () => {
    expect(parseProposedSlot('el martes o el jueves a la tarde', LUNES)).toBeNull()
  })

  it('"el miércoles o el martes a la tarde" → null (antes confirmaba el MARTES, por el orden de la lista)', () => {
    expect(parseProposedSlot('el miércoles o el martes a la tarde', LUNES)).toBeNull()
  })

  it('"mañana a la mañana o a la tarde" → null (dos franjas, ninguna elegida)', () => {
    expect(parseProposedSlot('mañana a la mañana o a la tarde', LUNES)?.franja).toBeUndefined()
  })

  it('decir lo mismo dos veces NO es ambiguo: "mañana martes a la tarde" resuelve normal', () => {
    expect(parseProposedSlot('mañana martes a la tarde', LUNES)).toEqual({ dateISO: '2026-08-04', franja: 'tarde' })
  })
})

// ---------------------------------------------------------------------------
// dayWord
// ---------------------------------------------------------------------------

describe('dayWord', () => {
  it('mañana/pasado mañana como palabra, el resto como día de semana + fecha', () => {
    const hoy = '2026-08-03'
    expect(dayWord('2026-08-04', hoy)).toBe('mañana')
    expect(dayWord('2026-08-05', hoy)).toBe('pasado mañana')
    expect(dayWord('2026-08-08', hoy)).toBe('el sábado 8/8')
  })
})

// ---------------------------------------------------------------------------
// decideSchedulingAction — pura. Orden de los frenos.
// ---------------------------------------------------------------------------
function ctx(overrides: Partial<SchedulingContext> = {}): SchedulingContext {
  return {
    now: LUNES,
    reply: '¿Qué día te viene bien?',
    agentMessagesSent: 0,
    agentHandedOff: false,
    maxMessagesPerConversation: 3,
    schedulingEnabledGlobal: true,
    schedulingEnabledProperty: true,
    windowOpen: true,
    ...overrides,
  }
}

describe('decideSchedulingAction', () => {
  it('agentHandedOff=true → noop, nunca vuelve a escribir', () => {
    expect(decideSchedulingAction(ctx({ agentHandedOff: true }))).toEqual({
      type: 'noop',
      reason: 'la conversación ya se le pasó a un humano',
    })
  })

  it('interruptor GLOBAL apagado → noop (arranca apagado)', () => {
    expect(decideSchedulingAction(ctx({ schedulingEnabledGlobal: false }))).toEqual({
      type: 'noop',
      reason: 'el agente que agenda está apagado globalmente',
    })
  })

  it('interruptor de PROPIEDAD apagado (aunque el global esté prendido) → noop', () => {
    expect(decideSchedulingAction(ctx({ schedulingEnabledProperty: false }))).toEqual({
      type: 'noop',
      reason: 'el agente que agenda está apagado para esta propiedad',
    })
  })

  it('ventana de 24hs cerrada → noop', () => {
    expect(decideSchedulingAction(ctx({ windowOpen: false }))).toEqual({
      type: 'noop',
      reason: 'la ventana de 24hs está cerrada',
    })
  })

  it('wantsToSchedule=false → noop (esto cubre el caso "mensaje ambiguo")', () => {
    expect(decideSchedulingAction(ctx({ wantsToSchedule: false }))).toEqual({
      type: 'noop',
      reason: 'el cliente no pidió agendar una visita en este turno',
    })
  })

  it('tope de mensajes alcanzado → handoff, ANTES de mirar el slot propuesto', () => {
    const result = decideSchedulingAction(ctx({ agentMessagesSent: 3, proposedSlot: 'mañana a la tarde' }))
    expect(result).toEqual({
      type: 'handoff',
      reason: 'se alcanzó el tope de 3 mensajes automáticos sin cerrar el agendamiento',
    })
  })

  it('quiere agendar + propone día parseable → confirm_visit', () => {
    const result = decideSchedulingAction(ctx({ proposedSlot: 'mañana a la tarde' }))
    expect(result).toEqual({ type: 'confirm_visit', dateISO: '2026-08-04', franja: 'tarde' })
  })

  it('quiere agendar sin decir cuándo (proposedSlot null) → ask_when', () => {
    const result = decideSchedulingAction(ctx({ proposedSlot: null }))
    expect(result).toEqual({ type: 'ask_when' })
  })

  it('quiere agendar pero el slot no se pudo parsear (texto raro) → ask_when, no confirma a ciegas', () => {
    const result = decideSchedulingAction(ctx({ proposedSlot: 'cuando sea, no tengo drama' }))
    expect(result.type).toBe('ask_when')
  })

  it('un "no puedo mañana a la tarde" NO termina en confirm_visit: se vuelve a preguntar día y hora', () => {
    // Antes devolvía `confirm_visit` para el martes a la tarde — el momento
    // exacto que el cliente acababa de descartar.
    const result = decideSchedulingAction(ctx({ proposedSlot: 'no puedo mañana a la tarde' }))
    expect(result.type).toBe('ask_when')
  })
})

// ---------------------------------------------------------------------------
// Prosa — textos EXACTOS que se le mandarían al cliente. Estos son los que
// van en el reporte para que el dueño los lea antes de prender el interruptor.
// ---------------------------------------------------------------------------
describe('prosa al cliente (textos exactos)', () => {
  it('buildConfirmMessage — el cliente dijo día y HORA', () => {
    const text = buildConfirmMessage('María Sánchez', 'Av. Cabildo 2450', '2026-08-04', 'tarde', LUNES, 16)
    expect(text).toBe(
      'Listo, María. Anoté la visita a Av. Cabildo 2450 para mañana a las 16. El equipo se comunica para confirmarla.',
    )
  })

  it('buildConfirmMessage — el cliente habló de franja, no de hora', () => {
    const text = buildConfirmMessage('María Sánchez', 'Av. Cabildo 2450', '2026-08-04', 'tarde', LUNES)
    expect(text).toBe(
      'Listo, María. Anoté la visita a Av. Cabildo 2450 para mañana por la tarde. El equipo se comunica para confirmarla.',
    )
  })

  it('buildAskWhenMessage — pregunta día y hora, sin lista de opciones', () => {
    expect(buildAskWhenMessage('Federico Ríos', 'Av. Cabildo 2450')).toBe(
      'Hola, Federico. ¿Qué día y a qué hora te queda bien para visitar Av. Cabildo 2450?',
    )
  })

  it('el aviso de que el equipo confirma va UNA sola vez, al final — no al preguntar', () => {
    expect(buildAskWhenMessage('Federico', 'Av. Cabildo 2450')).not.toMatch(/equipo/i)
    expect(buildConfirmMessage('María', 'Av. Cabildo 2450', '2026-08-04', 'tarde', LUNES, 16)).toMatch(/El equipo se comunica/)
  })

  it('buildHandoffNote — escenario "llegó al tope de mensajes" (nota INTERNA, no va al cliente)', () => {
    expect(buildHandoffNote(3)).toBe(
      '[Agente IA] Se alcanzó el tope de 3 mensajes automáticos en esta conversación sin cerrar el agendamiento. ' +
        'A partir de acá sigue una persona del equipo — el agente no vuelve a escribir en este chat.',
    )
  })

  it('sin nombre de cliente, el saludo degrada con elegancia', () => {
    expect(buildConfirmMessage(null, 'la propiedad', '2026-08-04', 'manana', LUNES)).toMatch(/^Listo\. /)
    expect(buildAskWhenMessage(null, 'la propiedad')).toMatch(/^Hola\. /)
  })
})

// ---------------------------------------------------------------------------
// runSchedulingAgent — I/O. Mismo patrón que lib/leads/pipeline-state.test.ts:
// mockeamos @supabase/supabase-js + los módulos de envío/notificación para
// probar la orquestación sin pegarle a una base o a Meta real.
// ---------------------------------------------------------------------------

const settingsMaybeSingle = vi.fn()
const settingsEq = vi.fn(() => ({ maybeSingle: settingsMaybeSingle }))
const settingsSelect = vi.fn(() => ({ eq: settingsEq }))

const propMaybeSingle = vi.fn()
const propEq = vi.fn(() => ({ maybeSingle: propMaybeSingle }))
const propSelect = vi.fn(() => ({ eq: propEq }))

// property_visits: select (findExistingActiveVisit) / update / insert.
// OJO: el select ya NO filtra por `client_phone` en la query — trae las visitas
// VIGENTES de la propiedad y compara por teléfono NORMALIZADO en memoria (ver
// HALLAZGO 8). Por eso la cadena tiene un `eq` menos y termina en `limit`
// (lista), no en `maybeSingle`.
//
// El mock FILTRA DE VERDAD por el status pedido (PUNTO 2): guarda lo que pidió
// la query (`.eq('status', x)` o `.in('status', [...])`) y devuelve solo las
// filas que matchean. Sin esto, un test de "una visita `scheduled` también
// frena" pasaría en verde con el filtro viejo — el mock devolvía la fila igual.
let visitStatusFilter: string[] = []
const visitsLimitResult = vi.fn()
const visitsLimit = vi.fn(async () => {
  const res = (await visitsLimitResult()) as {
    data: Array<{ status?: string }> | null
    error: { message: string } | null
  }
  if (res.error) return res
  const rows = (res.data ?? []).filter((r) => visitStatusFilter.includes(r.status ?? 'pending_confirmation'))
  return { data: rows, error: null }
})
const visitsOrder = vi.fn(() => ({ limit: visitsLimit }))
const visitsEqStatusForSelect = vi.fn((_col: string, value: string) => {
  visitStatusFilter = [value]
  return { order: visitsOrder }
})
const visitsInStatus = vi.fn((_col: string, values: string[]) => {
  visitStatusFilter = values
  return { order: visitsOrder }
})
// Se ofrecen las DOS formas (`eq` e `in`) a propósito: así el test del PUNTO 2
// falla por la ASERCIÓN de comportamiento y no por un TypeError del mock.
const visitsEqProperty = vi.fn(() => ({ eq: visitsEqStatusForSelect, in: visitsInStatus }))
const visitsSelect = vi.fn(() => ({ eq: visitsEqProperty }))

/** Ninguna visita vigente para la propiedad. */
function mockSinVisitaPendiente() {
  visitsLimitResult.mockResolvedValueOnce({ data: [], error: null })
}
/** La lectura de `property_visits` FALLA (PostgREST/RLS/red) — ver PUNTO 1. */
function mockLecturaVisitasRota(message = 'PostgREST caído') {
  visitsLimitResult.mockResolvedValueOnce({ data: null, error: { message } })
}
/**
 * Una visita ya en agenda, con el teléfono como lo tipeó quien la cargó.
 * `scheduledAt` default = FUTURO respecto de LUNES (visita vigente); los tests
 * del PROBLEMA D pasan una fecha ya pasada. `status` default =
 * `pending_confirmation` (el único que existía antes del PUNTO 2).
 */
function mockVisitaPendiente(
  clientPhone: string,
  scheduledAt = '2026-08-04T18:00:00.000Z',
  createdAt = '2026-08-03T09:00:00.000Z',
  status = 'pending_confirmation',
) {
  visitsLimitResult.mockResolvedValueOnce({
    data: [{ id: 'visit-previa', client_phone: clientPhone, scheduled_at: scheduledAt, created_at: createdAt, status }],
    error: null,
  })
}

const visitsUpdateMaybeSingle = vi.fn()
const visitsUpdateSelect = vi.fn(() => ({ maybeSingle: visitsUpdateMaybeSingle }))
const visitsUpdateEqStatus = vi.fn(() => ({ select: visitsUpdateSelect }))
const visitsUpdateEqId = vi.fn(() => ({ eq: visitsUpdateEqStatus }))
const visitsUpdate = vi.fn(() => ({ eq: visitsUpdateEqId }))

const visitsInsertSingle = vi.fn()
const visitsInsertSelect = vi.fn(() => ({ single: visitsInsertSingle }))
const visitsInsert = vi.fn(() => ({ select: visitsInsertSelect }))

// property_leads: solo select (resolveClientName fallback)
const leadsMaybeSingle = vi.fn()
const leadsEq = vi.fn(() => ({ maybeSingle: leadsMaybeSingle }))
const leadsSelect = vi.fn(() => ({ eq: leadsEq }))

// conversation_ai_state: select (contadores del agente) + update (updateAgentState)
let estadoConversacion: { agent_messages_sent: number; agent_handed_off: boolean } | null = {
  agent_messages_sent: 0,
  agent_handed_off: false,
}
const stateMaybeSingle = vi.fn(() => Promise.resolve({ data: estadoConversacion, error: null }))
const stateSelectEq = vi.fn(() => ({ maybeSingle: stateMaybeSingle }))
const stateSelect = vi.fn(() => ({ eq: stateSelectEq }))
const stateUpdateEq = vi.fn(() => Promise.resolve({ error: null }))
const stateUpdate = vi.fn(() => ({ eq: stateUpdateEq }))

// whatsapp_messages: select (¿ya dejamos la nota interna de "visita pendiente"?)
// El `.gte('created_at', ...)` acota la búsqueda al EPISODIO actual (PROBLEMA C):
// una nota vieja de otra visita no puede silenciar la de la visita de ahora. El
// `limit` sigue colgando también de `eqStatus` a propósito: así el mock no
// obliga a la cadena nueva y el test falla por la ASERCIÓN, no por un TypeError.
const notesMaybeSingle = vi.fn()
const notesLimit = vi.fn(() => ({ maybeSingle: notesMaybeSingle }))
const notesGte = vi.fn(() => ({ limit: notesLimit }))
const notesEqStatus = vi.fn(() => ({ gte: notesGte, limit: notesLimit }))
const notesEqProperty = vi.fn(() => ({ eq: notesEqStatus }))
const notesEqPhone = vi.fn(() => ({ eq: notesEqProperty }))
const notesSelect = vi.fn(() => ({ eq: notesEqPhone }))

const fromMock = vi.fn((table: string) => {
  if (table === 'ai_agent_settings') return { select: settingsSelect }
  if (table === 'properties') return { select: propSelect }
  if (table === 'property_visits') return { select: visitsSelect, update: visitsUpdate, insert: visitsInsert }
  if (table === 'property_leads') return { select: leadsSelect }
  if (table === 'conversation_ai_state') return { update: stateUpdate, select: stateSelect }
  if (table === 'whatsapp_messages') return { select: notesSelect }
  throw new Error(`tabla inesperada en el mock: ${table}`)
})

// claim_agent_message_slot — la reserva ATÓMICA del cupo (HALLAZGO 4). Devuelve
// el número de mensaje reservado, o null si no había cupo.
const rpcMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock, rpc: rpcMock }),
}))

// `server-only` no existe fuera del build de Next.js (lo importa
// `lib/email/notifications/visit-proposed.ts`, transitivo vía `visit-scheduling.ts`).
vi.mock('server-only', () => ({}))

interface SentTextArgs {
  to: string
  text: string
  leadId?: string | null
  propertyId?: string | null
  sentBy?: string | null
  aiGenerated?: boolean
}
interface LogOutboundArgs {
  phone: string
  bodyPreview?: string | null
  status: string
  leadId?: string | null
  propertyId?: string | null
  sentBy?: string | null
  aiGenerated?: boolean
}

// Los mocks se declaran con `vi.hoisted` porque `vi.mock(...)` se hoistea
// ARRIBA de cualquier `const` normal del archivo — referenciar una variable
// declarada más abajo directo desde el factory (en vez de detrás de un
// closure) explota con "Cannot access before initialization" apenas algún
// módulo importado arriba en la cadena (acá: `visit-scheduling.ts` →
// `visit-proposed.ts`/`pipeline-state.ts`) intenta resolver el mock.
// OJO: el default es un envío REAL (`skipped: false`). Antes era `skipped: true`,
// que es lo que devuelve `sendWhatsappText` en MODO PRUEBA — o sea, el camino
// feliz de los tests estaba modelando "no salió nada". Con el arreglo del
// PROBLEMA A ese valor ya no es neutro: dispara la devolución del cupo.
const { sendWhatsappTextMock, logOutboundMock, notifyVisitProposedMock, advancePipelineStateMock } = vi.hoisted(() => ({
  // El tipo de retorno va EXPLÍCITO (y no inferido del default) porque hay
  // tests que devuelven `error`: sin esto, TypeScript fija el shape en
  // `{ok, skipped}` y el caso "Meta falló" no compila.
  sendWhatsappTextMock: vi.fn(
    async (_input: SentTextArgs): Promise<{ ok: boolean; skipped: boolean; error?: string }> => ({
      ok: true,
      skipped: false,
    }),
  ),
  logOutboundMock: vi.fn(async (_input: LogOutboundArgs) => undefined),
  notifyVisitProposedMock: vi.fn(async (_visitId: string) => undefined),
  advancePipelineStateMock: vi.fn(async (_leadId: string, _event: string) => ({ changed: false, from: null, to: null })),
}))

const runConversationAnalysisMock = vi.hoisted(() => vi.fn())
const getConversationAiStateMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/integrations/whatsapp/core', () => ({
  sendWhatsappText: sendWhatsappTextMock,
}))
vi.mock('@/lib/integrations/whatsapp/log', () => ({
  logOutbound: logOutboundMock,
}))
vi.mock('@/lib/email/notifications/visit-proposed', () => ({
  notifyVisitProposed: notifyVisitProposedMock,
}))
vi.mock('@/lib/ai/analyze-conversation', () => ({
  runConversationAnalysis: runConversationAnalysisMock,
}))

vi.mock('@/lib/leads/pipeline-state', () => ({
  advancePipelineState: advancePipelineStateMock,
}))

function mockSettingsEnabled(overrides: Partial<{ scheduling_enabled: boolean; max_messages_per_conversation: number }> = {}) {
  settingsMaybeSingle.mockResolvedValueOnce({
    data: { scheduling_enabled: true, max_messages_per_conversation: 3, ...overrides },
    error: null,
  })
}
function mockPropertyEnabled(overrides: Partial<{ address: string | null; title: string | null; assigned_to: string | null; ai_scheduling_enabled: boolean }> = {}) {
  propMaybeSingle.mockResolvedValueOnce({
    data: { address: 'Av. Cabildo 2450', title: null, assigned_to: 'advisor-1', ai_scheduling_enabled: true, ...overrides },
    error: null,
  })
}

const BASE_INPUT = {
  phoneE164: '5491122334455',
  leadId: 'lead-1',
  propertyId: 'prop-1',
  contactName: 'María Sánchez',
  now: LUNES,
}

/**
 * El agente hace la llamada al modelo por dentro (`runConversationAnalysis`).
 * Acá se controla QUÉ devuelve ese modelo, que es lo que decide la respuesta.
 */
function mockAnalisis(over: Partial<{ reply: string | null; visitDate: string | null; visitHour: number | null; analyzed: boolean }> = {}) {
  runConversationAnalysisMock.mockResolvedValueOnce({
    state: null,
    analyzed: over.analyzed ?? true,
    readFailed: false,
    wantsToSchedule: true,
    proposedSlot: null,
    reply: over.reply !== undefined ? over.reply : '¿Qué día y a qué hora te queda bien?',
    visitDate: over.visitDate ?? null,
    visitHour: over.visitHour ?? null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  estadoConversacion = { agent_messages_sent: 0, agent_handed_off: false }
  stateMaybeSingle.mockImplementation(() => Promise.resolve({ data: estadoConversacion, error: null }))
  visitStatusFilter = []
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  // Defaults del camino feliz: hay cupo y todavía no hay ninguna nota interna.
  // Los tests que prueban lo contrario los pisan con `mockResolvedValueOnce`.
  rpcMock.mockResolvedValue({ data: 1, error: null })
  notesMaybeSingle.mockResolvedValue({ data: null, error: null })
})

describe('runSchedulingAgent (I/O)', () => {
  it('ESCENARIO 1 — quiere agendar y propone día: crea la visita pending_confirmation y manda el texto de confirmación', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    visitsInsertSingle.mockResolvedValueOnce({ data: { id: 'visit-1' }, error: null })

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    expect(result).toEqual({ action: 'confirm_visit' })
    expect(visitsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ property_id: 'prop-1', status: 'pending_confirmation', client_name: 'María Sánchez' }),
    )
    // La fila queda MARCADA como creada por la IA: sin esto, el panel de costo
    // tiene que deducir cuáles son del agente cruzando teléfonos.
    expect(visitsInsert).toHaveBeenCalledWith(expect.objectContaining({ created_by_ai: true }))
    expect(sendWhatsappTextMock).toHaveBeenCalledTimes(1)
    const sentArgs = sendWhatsappTextMock.mock.calls[0][0]
    expect(sentArgs.aiGenerated).toBe(true)
    expect(sentArgs.sentBy).toBeNull()
    expect(sentArgs.text).toContain('Anoté la visita')
    expect(notifyVisitProposedMock).toHaveBeenCalledWith('visit-1')
    expect(advancePipelineStateMock).toHaveBeenCalledWith('lead-1', 'visit_scheduled')
    // El cupo se reserva con la RPC atómica, NO con un UPDATE leído-y-escrito.
    expect(rpcMock).toHaveBeenCalledWith('claim_agent_message_slot', { p_phone: '5491122334455', p_max: 3 })
  })

  it('ESCENARIO 1bis — el WhatsApp al cliente sale DESPUÉS de guardar y de avisarle al equipo', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    const orden: string[] = []
    visitsInsertSingle.mockImplementationOnce(async () => {
      orden.push('insert')
      return { data: { id: 'visit-1' }, error: null }
    })
    notifyVisitProposedMock.mockImplementationOnce(async () => {
      orden.push('notify')
    })
    sendWhatsappTextMock.mockImplementationOnce(async () => {
      orden.push('send')
      return { ok: true, skipped: false }
    })

    await runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: 'mañana a la tarde' })

    expect(orden).toEqual(['insert', 'notify', 'send'])
  })

  it('HALLAZGO 3 — si el guardado de la visita FALLA, no se le confirma nada al cliente', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    visitsInsertSingle.mockResolvedValueOnce({ data: null, error: { message: 'permiso denegado' } })

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    // Lo que NO puede pasar: el cliente se presenta el martes y no lo espera nadie.
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(notifyVisitProposedMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled() // no se gasta cupo si no se manda nada
    expect(result.action).toBe('noop')
    // Queda rastro interno para que un asesor lo vea en el Inbox y lo coordine a mano.
    expect(logOutboundMock).toHaveBeenCalledTimes(1)
    const noteArgs = logOutboundMock.mock.calls[0][0]
    expect(noteArgs.status).toBe('agent_visit_failed')
    expect(noteArgs.bodyPreview).toContain('permiso denegado')
  })

  it('ESCENARIO 2 — quiere agendar sin decir cuándo: pregunta día y hora, NO crea visita', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: null,
    })

    expect(result).toEqual({ action: 'ask_when' })
    expect(visitsInsert).not.toHaveBeenCalled()
    expect(sendWhatsappTextMock).toHaveBeenCalledTimes(1)
    const sentArgs = sendWhatsappTextMock.mock.calls[0][0]
    expect(sentArgs.text).toContain('¿Qué día y a qué hora')
    expect(rpcMock).toHaveBeenCalledWith('claim_agent_message_slot', { p_phone: '5491122334455', p_max: 3 })
  })

  it('ESCENARIO 3 — mensaje ambiguo (wantsToSchedule=false): no manda nada', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: false,
      proposedSlot: null,
    })

    expect(result.action).toBe('noop')
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(logOutboundMock).not.toHaveBeenCalled()
    expect(stateUpdate).not.toHaveBeenCalled()
  })

  it('ESCENARIO 4 — llegó al tope de mensajes: NO manda WhatsApp al cliente, deja nota interna y marca agent_handed_off', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled({ max_messages_per_conversation: 3 })
    mockPropertyEnabled()

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
      agentMessagesSent: 3, // ya en el tope
    })

    expect(result.action).toBe('handoff')
    expect(sendWhatsappTextMock).not.toHaveBeenCalled() // nunca le escribe al cliente
    expect(logOutboundMock).toHaveBeenCalledTimes(1)
    const noteArgs = logOutboundMock.mock.calls[0][0]
    expect(noteArgs.aiGenerated).toBe(true)
    expect(noteArgs.status).toBe('agent_handoff')
    expect(noteArgs.bodyPreview).toContain('tope de 3 mensajes')
    expect(stateUpdate).toHaveBeenCalledWith(expect.objectContaining({ agent_handed_off: true }))
  })

  // -------------------------------------------------------------------------
  // HALLAZGO 2 — con una visita YA propuesta, el agente se calla. Sin esto, un
  // "gracias" al día siguiente reinterpretaba "mañana a la tarde" contra la
  // fecha de HOY y le CORRÍA la visita un día al cliente.
  // -------------------------------------------------------------------------
  it('HALLAZGO 2 — ya hay una visita pendiente para esa propiedad: no manda ni crea nada, deja UNA nota interna', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockVisitaPendiente('+5491122334455')

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde', // al día siguiente esto sería OTRA fecha
    })

    expect(result.action).toBe('noop')
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(visitsInsert).not.toHaveBeenCalled()
    expect(visitsUpdate).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
    expect(logOutboundMock).toHaveBeenCalledTimes(1)
    const noteArgs = logOutboundMock.mock.calls[0][0]
    expect(noteArgs.status).toBe('agent_visit_pending')
    expect(noteArgs.aiGenerated).toBe(true)
    expect(noteArgs.bodyPreview).toContain('ya está propuesta')
  })

  it('HALLAZGO 2 — la nota interna NO se repite en cada mensaje del cliente', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockVisitaPendiente('+5491122334455')
    notesMaybeSingle.mockResolvedValueOnce({ data: { id: 'nota-previa' }, error: null }) // ya la dejamos antes

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'el jueves a la tarde',
    })

    expect(result.action).toBe('noop')
    expect(logOutboundMock).not.toHaveBeenCalled()
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
  })

  it('HALLAZGO 8 — encuentra la visita que el cliente creó desde /v/<token> con el teléfono tipeado a mano', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    // Así queda guardado cuando lo tipea el cliente en el formulario del recorrido.
    mockVisitaPendiente('11 2233-4455')

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    // Antes del arreglo esto creaba una SEGUNDA visita contradictoria + un
    // segundo mail al equipo, porque comparaba el texto crudo contra el E.164.
    expect(visitsInsert).not.toHaveBeenCalled()
    expect(notifyVisitProposedMock).not.toHaveBeenCalled()
    expect(result.action).toBe('noop')
  })

  it('HALLAZGO 8 — un teléfono de OTRA persona con sufijo parecido NO cuenta como la misma visita', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockVisitaPendiente('11 5555-4455') // mismos últimos 4 dígitos, otro número
    visitsInsertSingle.mockResolvedValueOnce({ data: { id: 'visit-nueva' }, error: null })

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    expect(result).toEqual({ action: 'confirm_visit' })
    expect(visitsInsert).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // HALLAZGO 4 — el cupo se RESERVA antes de mandar. Dos webhooks concurrentes
  // leían `agent_messages_sent = 0` los dos y mandaban el mismo texto dos veces.
  // -------------------------------------------------------------------------
  it('HALLAZGO 4 — sin cupo (la RPC no devuelve fila): no manda nada', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    rpcMock.mockResolvedValueOnce({ data: null, error: null }) // la carrera la ganó el otro webhook

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: null,
    })

    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(result.action).toBe('noop')
  })

  it('HALLAZGO 4 — si la RPC falla (o no existe todavía), fail-closed: no manda nada', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'function does not exist' } })

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: null,
    })

    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(result.action).toBe('noop')
  })

  it('HALLAZGO 4 — con cupo, manda (y el cupo se reserva ANTES del envío)', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    const orden: string[] = []
    rpcMock.mockImplementationOnce(async () => {
      orden.push('claim')
      return { data: 1, error: null }
    })
    sendWhatsappTextMock.mockImplementationOnce(async () => {
      orden.push('send')
      return { ok: true, skipped: false }
    })

    const result = await runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: null })

    expect(result).toEqual({ action: 'ask_when' })
    expect(orden).toEqual(['claim', 'send'])
  })

  // -------------------------------------------------------------------------
  // PROBLEMA A — el cupo tiene que reflejar mensajes que SALIERON. En modo
  // prueba (o sin credenciales) `sendWhatsappText` devuelve `skipped` y no
  // manda NADA: si el cupo igual se consumía, el día que se prendiera el
  // interruptor con el modo prueba todavía activo el agente quemaba los 3
  // cupos de cada conversación sin que el cliente leyera una sola palabra, y
  // después quedaba mudo para siempre creyendo que ya había hablado.
  // -------------------------------------------------------------------------
  it('PROBLEMA A — si el envío se SALTEA (modo prueba / sin credenciales), el cupo se devuelve', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    rpcMock.mockResolvedValueOnce({ data: 1, error: null }) // reservó el mensaje nº 1
    sendWhatsappTextMock.mockResolvedValueOnce({ ok: true, skipped: true }) // modo prueba: no salió nada

    const result = await runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: null })

    expect(result.action).toBe('ask_when')
    // El contador vuelve a 0: el cliente no recibió nada, el cupo sigue entero.
    expect(stateUpdate).toHaveBeenCalledWith(expect.objectContaining({ agent_messages_sent: 0 }))
  })

  it('PROBLEMA A — si el envío falla de VERDAD (error de Meta), el cupo NO se devuelve', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    rpcMock.mockResolvedValueOnce({ data: 1, error: null })
    // Meta puede haber aceptado el mensaje y habernos cortado la respuesta:
    // ante la duda preferimos mandar de menos, no de más.
    sendWhatsappTextMock.mockResolvedValueOnce({ ok: false, skipped: false, error: 'HTTP 500' })

    await runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: null })

    expect(stateUpdate).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // PROBLEMA B — la visita quedó guardada y el equipo ya recibió el mail, pero
  // al cliente no se le contestó. Sin nota interna, ese caso no dejaba NINGÚN
  // rastro en el chat: el único aviso llegaba si el cliente volvía a escribir.
  // -------------------------------------------------------------------------
  it('PROBLEMA B — visita guardada pero sin cupo para confirmarle al cliente: deja nota interna', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    visitsInsertSingle.mockResolvedValueOnce({ data: { id: 'visit-1' }, error: null })
    rpcMock.mockResolvedValueOnce({ data: null, error: null }) // la carrera la ganó otro webhook

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    expect(result.action).toBe('confirm_visit')
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(notifyVisitProposedMock).toHaveBeenCalledWith('visit-1') // el equipo sí se enteró
    expect(logOutboundMock).toHaveBeenCalledTimes(1)
    const noteArgs = logOutboundMock.mock.calls[0][0]
    expect(noteArgs.status).toBe('agent_visit_unconfirmed')
    expect(noteArgs.aiGenerated).toBe(true)
    expect(noteArgs.bodyPreview).toContain('NO se le pudo confirmar al cliente')
    expect(noteArgs.bodyPreview).toContain('mañana por la tarde') // la fecha que quedó anotada
  })

  // -------------------------------------------------------------------------
  // PROBLEMA C — la nota de "ya hay visita propuesta" se dedup sin ventana:
  // en un segundo episodio, semanas después, el agente se callaba y no dejaba
  // ningún aviso nuevo. Y si la lectura fallaba, tampoco escribía.
  // -------------------------------------------------------------------------
  it('PROBLEMA C — la dedup de la nota se acota al episodio de ESTA visita, no a toda la historia', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockVisitaPendiente('+5491122334455', '2026-08-04T18:00:00.000Z', '2026-08-03T09:00:00.000Z')

    await runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: 'mañana a la tarde' })

    // Solo se pregunta por notas POSTERIORES a la creación de esta visita: una
    // nota de un agendamiento de hace un mes ya no la silencia.
    expect(notesGte).toHaveBeenCalledWith('created_at', '2026-08-03T09:00:00.000Z')
  })

  it('PROBLEMA C — si la lectura de la nota falla, la nota SE ESCRIBE igual (una repetida es ruido, una faltante es un cliente sin atender)', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockVisitaPendiente('+5491122334455')
    notesMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'PostgREST caído' } })

    const result = await runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: 'mañana a la tarde' })

    expect(result.action).toBe('noop')
    expect(logOutboundMock).toHaveBeenCalledTimes(1)
    expect(logOutboundMock.mock.calls[0][0].status).toBe('agent_visit_pending')
  })

  // -------------------------------------------------------------------------
  // PROBLEMA D — una pending_confirmation de hace meses que nadie confirmó ni
  // canceló dejaba al agente mudo para siempre con ese cliente.
  // -------------------------------------------------------------------------
  it('PROBLEMA D — una visita pendiente cuya fecha YA PASÓ no frena al agente', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    // Propuesta hace tres meses, nunca confirmada ni cancelada: basura, no agenda.
    mockVisitaPendiente('+5491122334455', '2026-05-04T18:00:00.000Z', '2026-05-03T09:00:00.000Z')
    visitsInsertSingle.mockResolvedValueOnce({ data: { id: 'visit-nueva' }, error: null })

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    expect(result).toEqual({ action: 'confirm_visit' })
    expect(visitsInsert).toHaveBeenCalledTimes(1)
    expect(sendWhatsappTextMock).toHaveBeenCalledTimes(1)
  })

  it('PROBLEMA D — una visita de HOY más temprano SÍ sigue frenando (el cliente puede estar escribiendo por esa misma visita)', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    // LUNES es 2026-08-03T12:00Z; esta visita fue a las 09:00Z del mismo día.
    mockVisitaPendiente('+5491122334455', '2026-08-03T09:00:00.000Z', '2026-08-02T09:00:00.000Z')

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    expect(result.action).toBe('noop')
    expect(visitsInsert).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // PUNTO 1 — la búsqueda de visita ya agendada fallaba ABIERTO: un error de
  // PostgREST/RLS/red se leía igual que "no hay ninguna visita", y el agente
  // creaba una visita DUPLICADA + un segundo mail al equipo + un WhatsApp al
  // cliente como si fuera la primera vez. Mismo criterio que
  // `getConversationAiState`: no poder leer NO es lo mismo que no haber nada.
  // -------------------------------------------------------------------------
  it('PUNTO 1 — si no se puede LEER si ya hay visita, no crea ni manda nada (fail-closed)', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockLecturaVisitasRota('PostgREST caído')

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    expect(result.action).toBe('noop')
    expect(visitsInsert).not.toHaveBeenCalled()
    expect(notifyVisitProposedMock).not.toHaveBeenCalled()
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
    // Pero queda rastro: si el agente se calla, alguien tiene que enterarse.
    expect(logOutboundMock).toHaveBeenCalledTimes(1)
    const noteArgs = logOutboundMock.mock.calls[0][0]
    expect(noteArgs.status).toBe('agent_visit_lookup_failed')
    expect(noteArgs.aiGenerated).toBe(true)
    expect(noteArgs.bodyPreview).toContain('PostgREST caído')
  })

  it('PUNTO 1 — lo mismo si la lectura EXPLOTA (excepción, no error de PostgREST)', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    visitsLimitResult.mockRejectedValueOnce(new Error('socket hang up'))

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    expect(result.action).toBe('noop')
    expect(visitsInsert).not.toHaveBeenCalled()
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(logOutboundMock).toHaveBeenCalledTimes(1)
    expect(logOutboundMock.mock.calls[0][0].status).toBe('agent_visit_lookup_failed')
  })

  // -------------------------------------------------------------------------
  // PUNTO 2 — el freno miraba SOLO `pending_confirmation`. Apenas el asesor
  // CONFIRMA la visita pasa a `scheduled` y el freno desaparecía: un "gracias,
  // nos vemos" podía hacer que el agente propusiera (o creara) otra visita
  // arriba de una que el asesor ya tenía cerrada con el cliente.
  // -------------------------------------------------------------------------
  it('PUNTO 2 — una visita YA CONFIRMADA (scheduled) también frena al agente', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockVisitaPendiente('+5491122334455', '2026-08-04T18:00:00.000Z', '2026-08-03T09:00:00.000Z', 'scheduled')

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    expect(result.action).toBe('noop')
    expect(visitsInsert).not.toHaveBeenCalled()
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(logOutboundMock).toHaveBeenCalledTimes(1)
    const noteArgs = logOutboundMock.mock.calls[0][0]
    expect(noteArgs.status).toBe('agent_visit_pending')
    // La nota no puede decir "sin confirmar" de una visita que el asesor confirmó.
    expect(noteArgs.bodyPreview).toContain('ya está confirmada')
  })

  it('PUNTO 2 — la query pide los estados VIVOS, no solo pending_confirmation', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()

    await runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: null })

    expect(visitsInStatus).toHaveBeenCalledWith('status', ['pending_confirmation', 'scheduled'])
  })

  it('PUNTO 2 — una visita CANCELADA o YA REALIZADA no frena nada', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    visitsLimitResult.mockResolvedValueOnce({
      data: [
        { id: 'v-cancel', client_phone: '+5491122334455', scheduled_at: '2026-08-04T18:00:00.000Z', created_at: '2026-08-03T09:00:00.000Z', status: 'cancelled' },
        { id: 'v-hecha', client_phone: '+5491122334455', scheduled_at: '2026-08-04T18:00:00.000Z', created_at: '2026-08-03T09:00:00.000Z', status: 'completed' },
      ],
      error: null,
    })
    visitsInsertSingle.mockResolvedValueOnce({ data: { id: 'visit-nueva' }, error: null })

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    expect(result).toEqual({ action: 'confirm_visit' })
    expect(visitsInsert).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // PUNTO 3 — (a) el camino de PROPONER sin cupo se callaba sin dejar rastro,
  // asimétrico con el de confirmar; (b) la nota decía siempre "se agotó el
  // cupo" aunque lo que había pasado era que la RPC de reserva FALLÓ, y eso
  // manda al asesor a mirar el tope en vez del problema real.
  // -------------------------------------------------------------------------
  it('PUNTO 3a — preguntar día y hora sin cupo: deja nota interna (igual que el camino de confirmar)', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    rpcMock.mockResolvedValueOnce({ data: null, error: null }) // sin cupo

    const result = await runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: null })

    expect(result.action).toBe('noop')
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(logOutboundMock).toHaveBeenCalledTimes(1)
    const noteArgs = logOutboundMock.mock.calls[0][0]
    expect(noteArgs.status).toBe('agent_propose_unsent')
    expect(noteArgs.aiGenerated).toBe(true)
    expect(noteArgs.bodyPreview).toContain('se agotó el cupo de mensajes automáticos')
  })

  it('PUNTO 3b — si la RPC de reserva FALLA, la nota dice la causa real (no "se agotó el cupo")', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'function does not exist' } })

    await runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: null })

    expect(logOutboundMock).toHaveBeenCalledTimes(1)
    const noteArgs = logOutboundMock.mock.calls[0][0]
    expect(noteArgs.status).toBe('agent_propose_unsent')
    expect(noteArgs.bodyPreview).toContain('falló la reserva del cupo')
    expect(noteArgs.bodyPreview).not.toContain('se agotó el cupo')
  })

  it('PUNTO 3b — mismo criterio en el camino de confirmar: visita guardada + RPC rota → la nota no culpa al tope', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    visitsInsertSingle.mockResolvedValueOnce({ data: { id: 'visit-1' }, error: null })
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'deadlock detected' } })

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    expect(result.action).toBe('confirm_visit')
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    const noteArgs = logOutboundMock.mock.calls[0][0]
    expect(noteArgs.status).toBe('agent_visit_unconfirmed')
    expect(noteArgs.bodyPreview).toContain('falló la reserva del cupo')
    expect(noteArgs.bodyPreview).not.toContain('se agotó el cupo')
  })

  // -------------------------------------------------------------------------
  // PUNTO 4 — el fallback `Cliente WhatsApp +54911...` está pensado para el
  // campo `client_name` de la visita, NO para hablarle a una persona: el
  // helper que toma el primer nombre lo recortaba a "Cliente" y el cliente
  // leía "¡Buenísimo, Cliente! Anoté tu visita…".
  // -------------------------------------------------------------------------
  it('PUNTO 4 — sin nombre real, el saludo va SIN nombre (nunca "¡Buenísimo, Cliente!")', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()
    visitsInsertSingle.mockResolvedValueOnce({ data: { id: 'visit-1' }, error: null })

    await runSchedulingAgent({
      ...BASE_INPUT,
      contactName: null,
      leadId: null,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })

    const sentArgs = sendWhatsappTextMock.mock.calls[0][0]
    expect(sentArgs.text.startsWith('Listo. Anoté la visita')).toBe(true)
    expect(sentArgs.text).not.toContain('Cliente')
    // El fallback SÍ sigue sirviendo para el campo de la visita (es NOT NULL).
    expect(visitsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ client_name: 'Cliente WhatsApp +5491122334455' }),
    )
  })

  it('PUNTO 4 — al preguntar día y hora también: sin nombre real, "Hola." pelado', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()

    await runSchedulingAgent({
      ...BASE_INPUT,
      contactName: null,
      leadId: null,
      wantsToSchedule: true,
      proposedSlot: null,
    })

    const sentArgs = sendWhatsappTextMock.mock.calls[0][0]
    expect(sentArgs.text.startsWith('Hola. ¿Qué día')).toBe(true)
    expect(sentArgs.text).not.toContain('Cliente')
  })

  it('agentHandedOff ya en true: nunca vuelve a evaluar nada, no manda nada', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
      agentHandedOff: true,
    })
    expect(result.action).toBe('noop')
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
    expect(logOutboundMock).not.toHaveBeenCalled()
  })

  it('FRENO — interruptor global apagado (arranca apagado): analiza pero no manda nada aunque el cliente pida agendar', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    settingsMaybeSingle.mockResolvedValueOnce({ data: { scheduling_enabled: false, max_messages_per_conversation: 3 }, error: null })
    mockPropertyEnabled()
    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })
    expect(result).toEqual({ action: 'noop', reason: 'el agente que agenda está apagado globalmente' })
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
  })

  it('FRENO — apagado a nivel PROPIEDAD: no manda nada aunque el global esté prendido', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled({ ai_scheduling_enabled: false })
    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })
    expect(result).toEqual({ action: 'noop', reason: 'el agente que agenda está apagado para esta propiedad' })
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
  })

  it('FAIL-CLOSED — si no se puede leer ai_agent_settings, no manda nada (nunca asume "prendido")', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    settingsMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'tabla no existe' } })
    mockPropertyEnabled()
    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })
    expect(result.action).toBe('noop')
    expect(sendWhatsappTextMock).not.toHaveBeenCalled()
  })

  it('sin propertyId, no intenta nada (nunca hace red)', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      propertyId: null,
      wantsToSchedule: true,
      proposedSlot: 'mañana a la tarde',
    })
    expect(result.action).toBe('noop')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('un "no puedo mañana a la tarde" NO crea visita ni le confirma nada: le vuelve a preguntar', async () => {
    // El bug completo, de punta a punta: el cliente descarta un momento y el
    // agente se lo agendaba igual ("Anoté tu visita para mañana por la tarde"),
    // con fila en `property_visits` y mail al equipo incluidos.
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    mockSinVisitaPendiente()

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: 'no puedo mañana a la tarde',
    })

    expect(result).toEqual({ action: 'ask_when' })
    expect(visitsInsert).not.toHaveBeenCalled()
    expect(notifyVisitProposedMock).not.toHaveBeenCalled()
    const sentArgs = sendWhatsappTextMock.mock.calls[0][0]
    expect(sentArgs.text).not.toContain('Anoté la visita')
    expect(sentArgs.text).toContain('¿Qué día y a qué hora')
  })

  it('nunca lanza: una excepción interna cae a noop', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    settingsMaybeSingle.mockRejectedValueOnce(new Error('network down'))
    mockPropertyEnabled()
    await expect(
      runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: 'mañana a la tarde' }),
    ).resolves.toEqual({ action: 'noop', reason: 'excepción interna' })
  })
})

/**
 * Contrato con el Inbox. `components/inbox/MessageBubble.tsx` decide qué fila
 * SALIENTE es una nota interna —y no un mensaje que salió hacia el cliente—
 * mirando el prefijo `agent_`, porque no puede importar este módulo (es
 * `'use client'` y acá cuelga Supabase + la cadena de mails con
 * `import 'server-only'`).
 *
 * Este test es la mitad del contrato que vive de este lado: si mañana alguien
 * agrega un status de nota sin el prefijo, el Inbox lo pintaría con el verde de
 * un mensaje enviado —que es exactamente el bug que teníamos con
 * `agent_visit_lookup_failed` y `agent_propose_unsent`— y esto se pone en rojo
 * antes.
 */
describe('AGENT_NOTE_STATUSES (contrato con el Inbox)', () => {
  it('todos los status de nota interna arrancan con el prefijo que mira el Inbox', () => {
    for (const status of AGENT_NOTE_STATUSES) {
      expect(status.startsWith(AGENT_NOTE_STATUS_PREFIX)).toBe(true)
    }
  })

  it('están los SEIS que el agente escribe, sin repetidos', () => {
    expect(new Set(AGENT_NOTE_STATUSES).size).toBe(AGENT_NOTE_STATUSES.length)
    expect([...AGENT_NOTE_STATUSES].sort()).toEqual([
      'agent_handoff',
      'agent_propose_unsent',
      'agent_visit_failed',
      'agent_visit_lookup_failed',
      'agent_visit_pending',
      'agent_visit_unconfirmed',
    ])
  })
})

// Segunda mitad del mismo caso real: el cliente contesta "Mañana" y el agente
// tiene que preguntar SOLO la hora, no repetir la pregunta entera.
describe('el cliente dice el día pero no la hora', () => {
  it('decideSchedulingAction pide la hora, no vuelve a preguntar el día', () => {
    const r = decideSchedulingAction(ctx({ proposedSlot: 'mañana' }))
    expect(r).toEqual({ type: 'ask_time', dateISO: '2026-08-04' })
  })

  it('el texto nombra el día — se nota que lo escuchó', () => {
    expect(buildAskTimeMessage('Julián Parra', '2026-08-04', LUNES)).toBe(
      'Perfecto, Julián. ¿A qué hora te queda bien mañana?',
    )
  })

  it('con día Y hora sigue confirmando de una', () => {
    const r = decideSchedulingAction(ctx({ proposedSlot: 'mañana a las 16' }))
    expect(r).toEqual({ type: 'confirm_visit', dateISO: '2026-08-04', franja: 'tarde', hora: 16 })
  })
})
