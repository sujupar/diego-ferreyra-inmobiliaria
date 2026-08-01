import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseProposedSlot,
  nextBusinessDaySlots,
  dayWord,
  decideSchedulingAction,
  buildProposeMessage,
  buildConfirmMessage,
  buildHandoffNote,
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
    expect(parseProposedSlot('el sábado a las 10', LUNES)).toEqual({ dateISO: '2026-08-08', franja: 'manana' })
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

  it('día reconocible pero SIN franja → null (exige ambos para confirmar)', () => {
    expect(parseProposedSlot('mañana', LUNES)).toBeNull()
  })

  it('franja reconocible pero SIN día → null', () => {
    expect(parseProposedSlot('a la tarde', LUNES)).toBeNull()
  })

  it('null/"" no explota', () => {
    expect(parseProposedSlot('', LUNES)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// nextBusinessDaySlots / dayWord
// ---------------------------------------------------------------------------
describe('nextBusinessDaySlots', () => {
  it('desde un lunes, ofrece martes y miércoles (2 días hábiles, mañana+tarde c/u)', () => {
    const slots = nextBusinessDaySlots(LUNES, 2)
    expect(slots.map((s) => s.dateISO)).toEqual(['2026-08-04', '2026-08-04', '2026-08-05', '2026-08-05'])
    expect(slots.map((s) => s.franja)).toEqual(['manana', 'tarde', 'manana', 'tarde'])
  })

  it('desde un viernes, salta el fin de semana (ofrece lunes y martes)', () => {
    const VIERNES = new Date('2026-08-07T12:00:00Z')
    const slots = nextBusinessDaySlots(VIERNES, 2)
    expect(slots.map((s) => s.dateISO)).toEqual(['2026-08-10', '2026-08-10', '2026-08-11', '2026-08-11'])
  })
})

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
    wantsToSchedule: true,
    proposedSlot: null,
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

  it('quiere agendar sin decir cuándo (proposedSlot null) → propose_slots', () => {
    const result = decideSchedulingAction(ctx({ proposedSlot: null }))
    expect(result.type).toBe('propose_slots')
    if (result.type === 'propose_slots') expect(result.slots.length).toBeGreaterThan(0)
  })

  it('quiere agendar pero el slot no se pudo parsear (texto raro) → propose_slots, no confirma a ciegas', () => {
    const result = decideSchedulingAction(ctx({ proposedSlot: 'cuando sea, no tengo drama' }))
    expect(result.type).toBe('propose_slots')
  })
})

// ---------------------------------------------------------------------------
// Prosa — textos EXACTOS que se le mandarían al cliente. Estos son los que
// van en el reporte para que el dueño los lea antes de prender el interruptor.
// ---------------------------------------------------------------------------
describe('prosa al cliente (textos exactos)', () => {
  it('buildConfirmMessage — escenario "quiere agendar y propone día"', () => {
    const text = buildConfirmMessage('María Sánchez', 'la propiedad de Av. Cabildo 2450', '2026-08-04', 'tarde', LUNES)
    expect(text).toBe(
      '¡Buenísimo, María! Anoté tu visita a la propiedad de Av. Cabildo 2450 para mañana por la tarde. ' +
        'Coordino el horario exacto con nuestro equipo y te lo confirmamos por acá a la brevedad.',
    )
  })

  it('buildProposeMessage — escenario "quiere agendar sin decir cuándo"', () => {
    const slots = nextBusinessDaySlots(LUNES, 2)
    const text = buildProposeMessage('Federico Ríos', 'la propiedad de Av. Cabildo 2450', slots)
    expect(text).toBe(
      '¡Hola, Federico! Para coordinar la visita a la propiedad de Av. Cabildo 2450 tengo estas opciones:\n' +
        '1) mañana por la mañana\n' +
        '2) mañana por la tarde\n' +
        '3) pasado mañana por la mañana\n' +
        '4) pasado mañana por la tarde\n' +
        'Contame cuál te queda mejor (o si preferís otro día, decime cuál) y coordino el horario exacto con nuestro equipo, que te lo confirma por acá.',
    )
  })

  it('buildHandoffNote — escenario "llegó al tope de mensajes" (nota INTERNA, no va al cliente)', () => {
    expect(buildHandoffNote(3)).toBe(
      '[Agente IA] Se alcanzó el tope de 3 mensajes automáticos en esta conversación sin cerrar el agendamiento. ' +
        'A partir de acá sigue una persona del equipo — el agente no vuelve a escribir en este chat.',
    )
  })

  it('sin nombre de cliente, el saludo degrada con elegancia', () => {
    expect(buildConfirmMessage(null, 'la propiedad', '2026-08-04', 'manana', LUNES)).toMatch(/^¡Buenísimo! /)
    expect(buildProposeMessage(null, 'la propiedad', [])).toMatch(/^¡Hola! /)
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

// property_visits: select (findExistingPendingVisit) / update / insert
const visitsSelectMaybeSingle = vi.fn()
const visitsLimit = vi.fn(() => ({ maybeSingle: visitsSelectMaybeSingle }))
const visitsOrder = vi.fn(() => ({ limit: visitsLimit }))
const visitsEqStatusForSelect = vi.fn(() => ({ order: visitsOrder }))
const visitsEqPhone = vi.fn(() => ({ eq: visitsEqStatusForSelect }))
const visitsEqProperty = vi.fn(() => ({ eq: visitsEqPhone }))
const visitsSelect = vi.fn(() => ({ eq: visitsEqProperty }))

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

// conversation_ai_state: update (updateAgentState)
const stateUpdateEq = vi.fn(() => Promise.resolve({ error: null }))
const stateUpdate = vi.fn(() => ({ eq: stateUpdateEq }))

const fromMock = vi.fn((table: string) => {
  if (table === 'ai_agent_settings') return { select: settingsSelect }
  if (table === 'properties') return { select: propSelect }
  if (table === 'property_visits') return { select: visitsSelect, update: visitsUpdate, insert: visitsInsert }
  if (table === 'property_leads') return { select: leadsSelect }
  if (table === 'conversation_ai_state') return { update: stateUpdate }
  throw new Error(`tabla inesperada en el mock: ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock }),
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
const { sendWhatsappTextMock, logOutboundMock, notifyVisitProposedMock, advancePipelineStateMock } = vi.hoisted(() => ({
  sendWhatsappTextMock: vi.fn(async (_input: SentTextArgs) => ({ ok: true, skipped: true })),
  logOutboundMock: vi.fn(async (_input: LogOutboundArgs) => undefined),
  notifyVisitProposedMock: vi.fn(async (_visitId: string) => undefined),
  advancePipelineStateMock: vi.fn(async (_leadId: string, _event: string) => ({ changed: false, from: null, to: null })),
}))

vi.mock('@/lib/integrations/whatsapp/core', () => ({
  sendWhatsappText: sendWhatsappTextMock,
}))
vi.mock('@/lib/integrations/whatsapp/log', () => ({
  logOutbound: logOutboundMock,
}))
vi.mock('@/lib/email/notifications/visit-proposed', () => ({
  notifyVisitProposed: notifyVisitProposedMock,
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
  agentMessagesSent: 0,
  agentHandedOff: false,
  now: LUNES,
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
})

describe('runSchedulingAgent (I/O)', () => {
  it('ESCENARIO 1 — quiere agendar y propone día: crea la visita pending_confirmation y manda el texto de confirmación', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()
    visitsSelectMaybeSingle.mockResolvedValueOnce({ data: null, error: null }) // sin visita previa
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
    expect(sendWhatsappTextMock).toHaveBeenCalledTimes(1)
    const sentArgs = sendWhatsappTextMock.mock.calls[0][0]
    expect(sentArgs.aiGenerated).toBe(true)
    expect(sentArgs.sentBy).toBeNull()
    expect(sentArgs.text).toContain('Anoté tu visita')
    expect(notifyVisitProposedMock).toHaveBeenCalledWith('visit-1')
    expect(advancePipelineStateMock).toHaveBeenCalledWith('lead-1', 'visit_scheduled')
    expect(stateUpdate).toHaveBeenCalledWith(expect.objectContaining({ agent_messages_sent: 1 }))
  })

  it('ESCENARIO 2 — quiere agendar sin decir cuándo: propone franjas, NO crea visita', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    mockSettingsEnabled()
    mockPropertyEnabled()

    const result = await runSchedulingAgent({
      ...BASE_INPUT,
      wantsToSchedule: true,
      proposedSlot: null,
    })

    expect(result).toEqual({ action: 'propose_slots' })
    expect(visitsInsert).not.toHaveBeenCalled()
    expect(sendWhatsappTextMock).toHaveBeenCalledTimes(1)
    const sentArgs = sendWhatsappTextMock.mock.calls[0][0]
    expect(sentArgs.text).toContain('tengo estas opciones')
    expect(stateUpdate).toHaveBeenCalledWith(expect.objectContaining({ agent_messages_sent: 1 }))
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

  it('nunca lanza: una excepción interna cae a noop', async () => {
    const { runSchedulingAgent } = await import('./scheduling-agent')
    settingsMaybeSingle.mockRejectedValueOnce(new Error('network down'))
    mockPropertyEnabled()
    await expect(
      runSchedulingAgent({ ...BASE_INPUT, wantsToSchedule: true, proposedSlot: 'mañana a la tarde' }),
    ).resolves.toEqual({ action: 'noop', reason: 'excepción interna' })
  })
})
