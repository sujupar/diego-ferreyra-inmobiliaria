/**
 * El agente que agenda (task 3, `.superpowers/sdd/2026-08-03-agente-ia/`).
 *
 * ÚNICA pieza de todo el proyecto que le escribe a un cliente real por
 * WhatsApp por su cuenta (sin que un asesor apriete "enviar"). Corre PEGADA a
 * `runConversationAnalysis` (`./analyze-conversation.ts`), en el MISMO ciclo
 * del webhook — `wantsToSchedule`/`proposedSlot` viajan SOLO en el resultado
 * de esa llamada, no se persisten en ninguna columna. Si esto se llamara
 * desde un proceso aparte que lee la tabla, esos dos datos ya no estarían.
 *
 * NUNCA hace una llamada de IA propia: interpretar `proposedSlot` (texto
 * libre del cliente) se resuelve con un parser DETERMINÍSTICO
 * (`parseProposedSlot`), no con otra consulta al modelo — el análisis ya
 * gastó la única llamada de IA permitida en ESTE request (ver CLAUDE.md §
 * "nunca encadenar varias llamadas de IA dentro de UN request"). Y "lo que se
 * puede calcular sin IA, se calcula sin IA" — proponer franjas y armar la
 * fecha de una `property_visits` es aritmética de calendario, no un juicio.
 *
 * Reglas duras (ver brief):
 *   - Arranca apagado: `ai_agent_settings.scheduling_enabled` Y
 *     `properties.ai_scheduling_enabled` tienen que estar en `true`. Fail
 *     CLOSED: si no se puede leer alguno de los dos, NO manda nada.
 *   - Tope de `max_messages_per_conversation`: al llegar, `agent_handed_off =
 *     true` para siempre — nunca más vuelve a escribir en esa conversación.
 *     No le manda un aviso de "te escribe un humano" al CLIENTE (evita ruido
 *     innecesario en su WhatsApp); en cambio deja una nota INTERNA en
 *     `whatsapp_messages` (`status:'agent_handoff'`) para que el chat del
 *     Inbox se note que a partir de ahí sigue una persona.
 *   - El cupo de ese tope se RESERVA ANTES de mandar, con la RPC atómica
 *     `claim_agent_message_slot` (migración `20260803000004`). Leer el
 *     contador, mandar y después escribirlo NO alcanza: dos mensajes seguidos
 *     del cliente son dos webhooks concurrentes que leían `0` los dos,
 *     mandaban el MISMO texto dos veces y dejaban el contador en 1.
 *   - Con una visita `pending_confirmation` ya propuesta para esa propiedad y
 *     ese teléfono, el agente DEJA de proponer y de confirmar. No adivina si
 *     el cliente quiere moverla: correrle la fecha a una visita que el asesor
 *     ya tiene en agenda es decisión de una persona.
 *   - Al cliente NUNCA se le afirma que la visita quedó anotada antes de que
 *     esté guardada: el envío es la ÚLTIMA acción (guardar → avisar al equipo
 *     → recién ahí escribirle).
 *   - Ventana de 24hs abierta, siempre (Meta rechaza texto libre fuera de
 *     ventana).
 *   - Nunca promete un horario firme: SIEMPRE cierra con que el equipo
 *     confirma. La visita se crea `pending_confirmation`, igual que hoy.
 *   - Todo lo que manda queda registrado en `whatsapp_messages` con
 *     `sent_by: null` y `ai_generated: true` (columna nueva, migración
 *     `20260803000002_whatsapp_messages_ai_generated.sql`).
 *
 * Reusa, no duplica:
 *   - `lib/leads/visit-scheduling.ts` (extraído de `/v/[token]/schedule` en
 *     esta misma tarea) para crear/actualizar la `property_visits` y avisar
 *     al equipo — MISMO camino que usa hoy la agenda del recorrido.
 *   - `lib/integrations/whatsapp/core.ts` `sendWhatsappText` — respeta
 *     `WHATSAPP_TEST_MODE` como cualquier otro envío del sistema.
 */
import {
  admin,
  type Franja,
  FRANJA_HORA,
  FRANJA_LABEL_PROSA,
  hoyEnArgentina,
  sumarDias,
  diaDeSemana,
  esDiaHabil,
  scheduledAtFor,
  upsertPendingVisit,
  notifyAndAdvancePipeline,
} from '@/lib/leads/visit-scheduling'
import { serviceWindow } from '@/lib/integrations/whatsapp/window'
import { sendWhatsappText } from '@/lib/integrations/whatsapp/core'
import { logOutbound } from '@/lib/integrations/whatsapp/log'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import { updateAgentState } from '@/lib/ai/conversation-memory'

// ---------------------------------------------------------------------------
// Parser determinístico de "cuándo" — nunca IA. Entiende los patrones de
// castellano rioplatense más comunes para coordinar una visita. Ante
// cualquier ambigüedad, devuelve `null` (no adivina): el agente prefiere
// preguntar de nuevo con opciones concretas a agendar mal.
// ---------------------------------------------------------------------------

const WEEKDAYS: { name: string; dow: number }[] = [
  { name: 'domingo', dow: 0 },
  { name: 'lunes', dow: 1 },
  { name: 'martes', dow: 2 },
  { name: 'miercoles', dow: 3 },
  { name: 'jueves', dow: 4 },
  { name: 'viernes', dow: 5 },
  { name: 'sabado', dow: 6 },
]

/** Sin acentos, minúsculas — para matchear "mañana"/"manana" por igual. */
function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchWeekday(text: string): number | null {
  for (const w of WEEKDAYS) {
    if (new RegExp(`\\b${w.name}\\b`).test(text)) return w.dow
  }
  return null
}

/** Próxima fecha (>= mañana) que cae en `targetDow`. Si hoy ES ese día, salta a la semana que viene. */
function nextWeekday(todayISO: string, targetDow: number): string {
  for (let k = 1; k <= 7; k++) {
    const candidate = sumarDias(todayISO, k)
    if (diaDeSemana(candidate) === targetDow) return candidate
  }
  return sumarDias(todayISO, 7) // inalcanzable — todo dow aparece dentro de 7 días
}

/** Hora → franja, mismo bucket que `franjaLabelFromDate` de `visit-proposed.ts`. */
function franjaFromHour(hour: number): Franja {
  if (hour <= 10) return 'manana'
  if (hour <= 13) return 'mediodia'
  return 'tarde'
}

export interface ParsedSlot {
  dateISO: string
  franja: Franja
}

/**
 * Pura. Intenta extraer día + franja de un texto libre ("mañana a la tarde",
 * "el sábado a las 10", "pasado mañana por la mañana"). `null` si no puede
 * determinar AMBOS con confianza — eso es una señal para volver a preguntar
 * con opciones concretas, no para adivinar.
 */
export function parseProposedSlot(rawText: string, now: Date): ParsedSlot | null {
  let working = normalizeText(rawText)
  let franja: Franja | null = null

  // Franja explícita ligada a "a la"/"por la"/"de la"/"en la" — se consume del
  // texto ANTES de buscar el día, porque "mañana" es AMBIGUO en castellano
  // (día siguiente vs. franja de la mañana) y este patrón desambigua.
  const franjaConPreposicion: [RegExp, Franja][] = [
    [/(a la|por la|de la|en la)\s+tarde/, 'tarde'],
    [/(a la|por la|de la|en la)\s+manana/, 'manana'],
  ]
  for (const [re, f] of franjaConPreposicion) {
    const m = working.match(re)
    if (m) {
      franja = f
      working = working.replace(re, ' ')
      break
    }
  }
  if (!franja && /mediodia|medio dia/.test(working)) {
    franja = 'mediodia'
    working = working.replace(/mediodia|medio dia/, ' ')
  }
  if (!franja && /\btarde\b/.test(working)) {
    franja = 'tarde'
    working = working.replace(/\btarde\b/, ' ')
  }
  if (!franja) {
    const horaMatch = working.match(/\ba\s*las?\s*(\d{1,2})/)
    if (horaMatch) {
      franja = franjaFromHour(parseInt(horaMatch[1], 10))
      working = working.replace(horaMatch[0], ' ')
    }
  }
  if (!franja && /temprano/.test(working)) franja = 'manana'

  const today = hoyEnArgentina(now)
  let dateISO: string | null = null
  if (/pasado\s+manana/.test(working)) {
    dateISO = sumarDias(today, 2)
  } else {
    const weekdayDow = matchWeekday(working)
    if (weekdayDow !== null) {
      dateISO = nextWeekday(today, weekdayDow)
    } else if (/\bmanana\b/.test(working)) {
      dateISO = sumarDias(today, 1)
    }
    // "hoy" deliberadamente NO resuelve una fecha: el sistema nunca agenda
    // para el mismo día (mismo piso que `/v/[token]/schedule`, MIN = mañana).
  }

  if (!dateISO || !franja) return null
  return { dateISO, franja }
}

// ---------------------------------------------------------------------------
// Franjas propuestas cuando el cliente quiere agendar pero no dijo cuándo.
// ---------------------------------------------------------------------------

const WEEKDAY_LABEL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** "mañana" / "pasado mañana" / "el jueves 6/8" — según qué tan lejos esté `dateISO` de `todayISO`. */
export function dayWord(dateISO: string, todayISO: string): string {
  if (dateISO === sumarDias(todayISO, 1)) return 'mañana'
  if (dateISO === sumarDias(todayISO, 2)) return 'pasado mañana'
  const [, mm, dd] = dateISO.split('-')
  return `el ${WEEKDAY_LABEL[diaDeSemana(dateISO)]} ${Number(dd)}/${Number(mm)}`
}

export interface ProposedSlotOption {
  dateISO: string
  franja: Franja
  label: string
}

/**
 * Pura. Próximos `days` días HÁBILES desde mañana, cada uno con 2 franjas
 * (mañana/tarde — se omite mediodía para no saturar de opciones al cliente:
 * "menos vueltas" según el brief). Busca hasta 14 días adelante por si caen
 * varios fines de semana seguidos (no debería pasar nunca en la práctica).
 */
export function nextBusinessDaySlots(now: Date, days = 2): ProposedSlotOption[] {
  const today = hoyEnArgentina(now)
  const slots: ProposedSlotOption[] = []
  let offset = 1
  let found = 0
  while (found < days && offset <= 14) {
    const candidate = sumarDias(today, offset)
    if (esDiaHabil(candidate)) {
      for (const franja of ['manana', 'tarde'] as const) {
        slots.push({ dateISO: candidate, franja, label: `${dayWord(candidate, today)} ${FRANJA_LABEL_PROSA[franja]}` })
      }
      found++
    }
    offset++
  }
  return slots
}

// ---------------------------------------------------------------------------
// Decisión — pura, testeable sin red. Ver `SchedulingAction` para el
// contrato completo de qué puede devolver.
// ---------------------------------------------------------------------------

export type SchedulingAction =
  | { type: 'noop'; reason: string }
  | { type: 'handoff'; reason: string }
  | { type: 'propose_slots'; slots: ProposedSlotOption[] }
  | { type: 'confirm_visit'; dateISO: string; franja: Franja }

export interface SchedulingContext {
  now: Date
  wantsToSchedule: boolean
  proposedSlot: string | null
  agentMessagesSent: number
  agentHandedOff: boolean
  maxMessagesPerConversation: number
  schedulingEnabledGlobal: boolean
  schedulingEnabledProperty: boolean
  windowOpen: boolean
}

/**
 * Pura. El orden de los checks importa: los frenos (apagado, tope, ventana
 * cerrada) van ANTES que la intención — un `wantsToSchedule:true` nunca
 * puentea un freno.
 */
export function decideSchedulingAction(ctx: SchedulingContext): SchedulingAction {
  if (ctx.agentHandedOff) {
    return { type: 'noop', reason: 'la conversación ya se le pasó a un humano' }
  }
  if (!ctx.schedulingEnabledGlobal) {
    return { type: 'noop', reason: 'el agente que agenda está apagado globalmente' }
  }
  if (!ctx.schedulingEnabledProperty) {
    return { type: 'noop', reason: 'el agente que agenda está apagado para esta propiedad' }
  }
  if (!ctx.windowOpen) {
    return { type: 'noop', reason: 'la ventana de 24hs está cerrada' }
  }
  if (!ctx.wantsToSchedule) {
    return { type: 'noop', reason: 'el cliente no pidió agendar una visita en este turno' }
  }
  if (ctx.agentMessagesSent >= ctx.maxMessagesPerConversation) {
    return {
      type: 'handoff',
      reason: `se alcanzó el tope de ${ctx.maxMessagesPerConversation} mensajes automáticos sin cerrar el agendamiento`,
    }
  }

  const parsed = ctx.proposedSlot ? parseProposedSlot(ctx.proposedSlot, ctx.now) : null
  if (parsed) {
    return { type: 'confirm_visit', dateISO: parsed.dateISO, franja: parsed.franja }
  }
  return { type: 'propose_slots', slots: nextBusinessDaySlots(ctx.now) }
}

// ---------------------------------------------------------------------------
// Prosa — castellano rioplatense, cálido y profesional. Nunca promete
// horario firme: siempre cierra con que el equipo confirma.
// ---------------------------------------------------------------------------

function firstName(name: string | null): string {
  const trimmed = (name ?? '').trim()
  return trimmed ? trimmed.split(/\s+/)[0] : ''
}

export function buildProposeMessage(clientName: string | null, propertyLabel: string, slots: ProposedSlotOption[]): string {
  const nombre = firstName(clientName)
  const saludo = nombre ? `¡Hola, ${nombre}!` : '¡Hola!'
  const opciones = slots.map((s, i) => `${i + 1}) ${s.label}`).join('\n')
  return [
    `${saludo} Para coordinar la visita a ${propertyLabel} tengo estas opciones:`,
    opciones,
    'Contame cuál te queda mejor (o si preferís otro día, decime cuál) y coordino el horario exacto con nuestro equipo, que te lo confirma por acá.',
  ].join('\n')
}

export function buildConfirmMessage(
  clientName: string | null,
  propertyLabel: string,
  dateISO: string,
  franja: Franja,
  now: Date,
): string {
  const nombre = firstName(clientName)
  const saludo = nombre ? `¡Buenísimo, ${nombre}!` : '¡Buenísimo!'
  const dia = dayWord(dateISO, hoyEnArgentina(now))
  const franjaLabel = FRANJA_LABEL_PROSA[franja]
  return `${saludo} Anoté tu visita a ${propertyLabel} para ${dia} ${franjaLabel}. Coordino el horario exacto con nuestro equipo y te lo confirmamos por acá a la brevedad.`
}

/** Nota INTERNA (no se manda al cliente) — visible en el chat del Inbox para que un asesor sepa que a partir de acá sigue una persona. */
export function buildHandoffNote(max: number): string {
  return `[Agente IA] Se alcanzó el tope de ${max} mensajes automáticos en esta conversación sin cerrar el agendamiento. A partir de acá sigue una persona del equipo — el agente no vuelve a escribir en este chat.`
}

/**
 * Nota INTERNA. El cliente sigue hablando de una visita que YA está propuesta:
 * el agente se calla y avisa acá adentro. `fecha` en formato "4/8" (o `null` si
 * la visita no tiene fecha legible).
 */
export function buildPendingVisitNote(fecha: string | null): string {
  const cuando = fecha ? ` para el ${fecha}` : ''
  return `[Agente IA] El cliente sigue escribiendo sobre una visita que ya está propuesta${cuando} y todavía sin confirmar. El agente no vuelve a proponer ni a confirmar horarios de esta propiedad: mover una visita que el equipo ya tiene en agenda lo decide una persona.`
}

/**
 * Nota INTERNA. No se pudo guardar la visita, así que al cliente NO se le dijo
 * nada — ese es el punto de la nota: alguien tiene que coordinarla a mano.
 */
export function buildVisitFailedNote(error: string): string {
  return `[Agente IA] El cliente pidió coordinar una visita y NO se pudo registrar (${error}). No se le confirmó nada por WhatsApp — hay que contestarle y coordinarla a mano.`
}

// ---------------------------------------------------------------------------
// Orquestador — I/O. NUNCA lanza (mismo contrato que el resto de
// `lib/ai/` y `lib/integrations/whatsapp/`): cualquier fallo se traga con
// `console.warn` y el agente simplemente no manda nada esta vuelta.
// ---------------------------------------------------------------------------

export interface RunSchedulingAgentInput {
  phoneE164: string
  leadId: string | null
  propertyId: string | null
  /** Nombre de perfil de WhatsApp del contacto entrante, si Meta lo mandó. */
  contactName: string | null
  /** Del MISMO `runConversationAnalysis` que acaba de correr en este ciclo. */
  wantsToSchedule: boolean
  proposedSlot: string | null
  agentMessagesSent: number
  agentHandedOff: boolean
  now?: Date
}

export interface RunSchedulingAgentResult {
  action: SchedulingAction['type']
  reason?: string
}

/** Status de las notas INTERNAS del agente en `whatsapp_messages` (nunca se le mandan al cliente). */
const NOTE_STATUS_PENDING_VISIT = 'agent_visit_pending'
const NOTE_STATUS_VISIT_FAILED = 'agent_visit_failed'

export interface ExistingPendingVisit {
  id: string
  /** "4/8" — para la nota interna. `null` si la fila no tiene `scheduled_at` legible. */
  fecha: string | null
}

/**
 * Visita `pending_confirmation` de ESTA propiedad para ESTE teléfono.
 *
 * OJO — por qué no se filtra por `client_phone` en la query: la visita que el
 * cliente crea solo desde `/v/<token>` guarda el teléfono TAL CUAL lo tipeó
 * ("11 2233-4455"), no el E.164 del WhatsApp. Comparar exacto no matcheaba
 * NUNCA → se creaba una SEGUNDA visita contradictoria y salía un segundo mail
 * al equipo. Mismo patrón que `findLeadIdByPhone` en el webhook: se trae un
 * puñado de candidatas (las pending_confirmation de una propiedad son pocas
 * por definición) y la coincidencia REAL la decide `normalizeWhatsappPhone`,
 * que es exacta y no da falsos positivos por sufijo parecido.
 */
async function findExistingPendingVisit(
  sb: ReturnType<typeof admin>,
  propertyId: string,
  phoneE164: string,
): Promise<ExistingPendingVisit | null> {
  try {
    const { data } = await sb
      .from('property_visits')
      .select('id, client_phone, scheduled_at')
      .eq('property_id', propertyId)
      .eq('status', 'pending_confirmation')
      .order('created_at', { ascending: false })
      .limit(50)
    const rows = (data as Array<{ id: string; client_phone: string | null; scheduled_at: string | null }> | null) ?? []
    for (const row of rows) {
      if (normalizeWhatsappPhone(row.client_phone) === phoneE164) {
        return { id: row.id, fecha: fechaCortaArgentina(row.scheduled_at) }
      }
    }
    return null
  } catch {
    return null
  }
}

/** "2026-08-04T18:00:00Z" → "4/8" (día de Argentina, no del servidor). `null` si no es una fecha usable. */
function fechaCortaArgentina(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const [, mm, dd] = hoyEnArgentina(d).split('-')
  return `${Number(dd)}/${Number(mm)}`
}

/** ¿Ya dejamos esta nota interna en este chat? Evita repetirla en cada mensaje del cliente. */
async function yaHayNotaInterna(
  sb: ReturnType<typeof admin>,
  phoneE164: string,
  propertyId: string,
  status: string,
): Promise<boolean> {
  try {
    const { data, error } = await sb
      .from('whatsapp_messages')
      .select('id')
      .eq('phone_e164', phoneE164)
      .eq('property_id', propertyId)
      .eq('status', status)
      .limit(1)
      .maybeSingle()
    // Si no se pudo leer, asumimos que YA está: una nota de menos es un dato
    // que falta, una nota repetida en cada mensaje es ruido que tapa el chat.
    if (error) return true
    return data !== null
  } catch {
    return true
  }
}

/**
 * Reserva un cupo del tope de mensajes automáticos ANTES de mandar
 * (claim-before-send). La RPC hace `UPDATE ... WHERE agent_messages_sent <
 * p_max RETURNING agent_messages_sent` en UNA sentencia: dos webhooks
 * concurrentes se serializan sobre la fila y el segundo ve el contador ya
 * incrementado. Sin fila devuelta = sin cupo = no se manda nada.
 *
 * Fail-closed: si la RPC falla (o la migración todavía no corrió), devuelve
 * `false` y el agente no escribe. Y si el envío falla DESPUÉS de reservar, el
 * cupo queda consumido: es el lado seguro del error — este agente puede mandar
 * de menos, nunca de más.
 */
async function claimMessageSlot(
  sb: ReturnType<typeof admin>,
  phoneE164: string,
  max: number,
): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc('claim_agent_message_slot', { p_phone: phoneE164, p_max: max })
    if (error) {
      console.warn('[scheduling-agent] no se pudo reservar el cupo de mensajes — no se manda nada:', error.message)
      return false
    }
    return typeof data === 'number'
  } catch (err) {
    console.warn('[scheduling-agent] excepción reservando el cupo de mensajes — no se manda nada:', err)
    return false
  }
}

async function resolveClientName(
  sb: ReturnType<typeof admin>,
  input: Pick<RunSchedulingAgentInput, 'contactName' | 'leadId' | 'phoneE164'>,
): Promise<string> {
  const fromWa = input.contactName?.trim()
  if (fromWa) return fromWa
  if (input.leadId) {
    try {
      const { data } = await sb.from('property_leads').select('name').eq('id', input.leadId).maybeSingle()
      const name = (data as { name?: string | null } | null)?.name?.trim()
      if (name) return name
    } catch {
      /* cae al fallback */
    }
  }
  return `Cliente WhatsApp +${input.phoneE164}`
}

/**
 * Entrypoint del webhook. Lee los DOS interruptores (fail-closed: si no se
 * pueden leer, no manda nada), decide con `decideSchedulingAction`, y
 * ejecuta. NUNCA lanza.
 */
export async function runSchedulingAgent(input: RunSchedulingAgentInput): Promise<RunSchedulingAgentResult> {
  try {
    if (!input.propertyId) {
      return { action: 'noop', reason: 'la conversación no tiene una propiedad asociada' }
    }

    const now = input.now ?? new Date()
    const sb = admin()

    const [settingsRes, propRes] = await Promise.all([
      sb.from('ai_agent_settings').select('scheduling_enabled, max_messages_per_conversation').eq('id', true).maybeSingle(),
      sb.from('properties').select('address, title, assigned_to, ai_scheduling_enabled').eq('id', input.propertyId).maybeSingle(),
    ])

    // Fail-closed: "arranca apagado" también significa "si no estamos 100%
    // seguros de que está prendido, no mandamos nada".
    const settings = settingsRes.data as
      | { scheduling_enabled: boolean; max_messages_per_conversation: number }
      | null
    if (settingsRes.error || !settings) {
      console.warn(
        '[scheduling-agent] no se pudo leer ai_agent_settings — no se manda nada (fail-closed):',
        settingsRes.error?.message,
      )
      return { action: 'noop', reason: 'no se pudo confirmar el interruptor global' }
    }
    const prop = propRes.data as
      | { address: string | null; title: string | null; assigned_to: string | null; ai_scheduling_enabled: boolean }
      | null
    if (propRes.error || !prop) {
      console.warn(
        '[scheduling-agent] no se pudo leer la propiedad — no se manda nada (fail-closed):',
        propRes.error?.message,
      )
      return { action: 'noop', reason: 'no se pudo confirmar el interruptor de la propiedad' }
    }

    // Este ciclo corre INMEDIATAMENTE después de persistir el mensaje
    // entrante que disparó el análisis — la ventana, por construcción,
    // acaba de abrir. Se calcula explícito de todos modos (no hardcodeado a
    // `true`) para que el chequeo quede documentado y autocontenido.
    const windowOpen = serviceWindow(now.toISOString(), now).open

    const decision = decideSchedulingAction({
      now,
      wantsToSchedule: input.wantsToSchedule,
      proposedSlot: input.proposedSlot,
      agentMessagesSent: input.agentMessagesSent,
      agentHandedOff: input.agentHandedOff,
      maxMessagesPerConversation: settings.max_messages_per_conversation,
      schedulingEnabledGlobal: settings.scheduling_enabled,
      schedulingEnabledProperty: prop.ai_scheduling_enabled,
      windowOpen,
    })

    if (decision.type === 'noop') {
      return { action: 'noop', reason: decision.reason }
    }

    const propertyLabel = prop.address ? `la propiedad de ${prop.address}` : prop.title || 'la propiedad'

    if (decision.type === 'handoff') {
      // Nota INTERNA — no se manda al cliente por WhatsApp (no tiene sentido
      // avisarle "ahora te atiende un humano" en su propio chat). Se registra
      // igual en whatsapp_messages para que el Inbox lo muestre.
      await logOutbound({
        phone: input.phoneE164,
        bodyPreview: buildHandoffNote(settings.max_messages_per_conversation),
        status: 'agent_handoff',
        leadId: input.leadId,
        propertyId: input.propertyId,
        sentBy: null,
        aiGenerated: true,
      })
      await updateAgentState(input.phoneE164, { agentHandedOff: true })
      return { action: 'handoff', reason: decision.reason }
    }

    // FRENO de visita ya acordada. Va acá (I/O) y no en `decideSchedulingAction`
    // a propósito: recién cuando el agente está por ESCRIBIR vale la pena pagar
    // la consulta. Una vez que hay una visita propuesta para esta propiedad y
    // este teléfono, el agente no propone ni confirma más nada: el análisis
    // vuelve a marcar intención de agendar con cualquier "gracias" o "¿llevo el
    // DNI?", y el parser reinterpretaría un "mañana a la tarde" viejo contra la
    // fecha de HOY — o sea, le CORRERÍA la visita un día al cliente mientras el
    // asesor ya tiene la original en la agenda.
    const pendiente = await findExistingPendingVisit(sb, input.propertyId, input.phoneE164)
    if (pendiente) {
      if (!(await yaHayNotaInterna(sb, input.phoneE164, input.propertyId, NOTE_STATUS_PENDING_VISIT))) {
        await logOutbound({
          phone: input.phoneE164,
          bodyPreview: buildPendingVisitNote(pendiente.fecha),
          status: NOTE_STATUS_PENDING_VISIT,
          leadId: input.leadId,
          propertyId: input.propertyId,
          sentBy: null,
          aiGenerated: true,
        })
      }
      return { action: 'noop', reason: 'ya hay una visita propuesta para esta propiedad; moverla la decide una persona' }
    }

    if (decision.type === 'propose_slots') {
      const clientName = await resolveClientName(sb, input)
      const text = buildProposeMessage(clientName, propertyLabel, decision.slots)
      if (!(await claimMessageSlot(sb, input.phoneE164, settings.max_messages_per_conversation))) {
        return { action: 'noop', reason: 'no quedaba cupo de mensajes automáticos al momento de mandar' }
      }
      await sendWhatsappText({
        to: input.phoneE164,
        text,
        leadId: input.leadId,
        propertyId: input.propertyId,
        sentBy: null,
        aiGenerated: true,
      })
      return { action: 'propose_slots' }
    }

    // confirm_visit. ORDEN NO NEGOCIABLE: guardar → avisar al equipo → recién
    // ahí escribirle al cliente. Antes el WhatsApp salía ANTES de mirar si el
    // guardado había funcionado: si fallaba, el cliente igual leía "Anoté tu
    // visita", nadie recibía el mail, no quedaba nada en el CRM, y el cliente
    // se presentaba en la propiedad sin que lo esperara nadie.
    const clientName = await resolveClientName(sb, input)
    const clientPhone = `+${input.phoneE164}`
    const scheduledAt = scheduledAtFor(decision.dateISO, decision.franja)
    const notes = `Propuesta por el cliente vía WhatsApp (agente de IA, franja: ${decision.franja}).`

    const result = await upsertPendingVisit(sb, {
      propertyId: input.propertyId,
      advisorId: prop.assigned_to,
      clientName,
      clientEmail: null,
      clientPhone,
      scheduledAt,
      notes,
      // Siempre INSERT: si hubiera una pending_confirmation de este cliente
      // para esta propiedad, el freno de arriba ya nos sacó del camino.
      existingVisitId: null,
      // Marca la fila como "la agendó la IA" — así el panel de costo cuenta
      // estas visitas como un hecho y no deduciéndolas por teléfono.
      createdByAi: true,
    })

    if (!result.ok) {
      console.warn('[scheduling-agent] no se pudo crear la visita pending_confirmation:', result.error)
      // Nota INTERNA con el error. Nada que le afirme al cliente que quedó
      // anotada — no quedó.
      await logOutbound({
        phone: input.phoneE164,
        bodyPreview: buildVisitFailedNote(result.error),
        status: NOTE_STATUS_VISIT_FAILED,
        leadId: input.leadId,
        propertyId: input.propertyId,
        sentBy: null,
        aiGenerated: true,
      })
      return { action: 'noop', reason: `visita no registrada: ${result.error}` }
    }

    await notifyAndAdvancePipeline(result.visitId, input.leadId)

    // Última acción. Si acá no queda cupo (la carrera la ganó otro webhook), la
    // visita YA está registrada y el equipo YA recibió el aviso: la cierra una
    // persona. Callarse es preferible a mandarle dos veces lo mismo al cliente.
    if (!(await claimMessageSlot(sb, input.phoneE164, settings.max_messages_per_conversation))) {
      return {
        action: 'confirm_visit',
        reason: 'la visita quedó registrada pero no se le confirmó al cliente: sin cupo de mensajes automáticos',
      }
    }
    const text = buildConfirmMessage(clientName, propertyLabel, decision.dateISO, decision.franja, now)
    await sendWhatsappText({
      to: input.phoneE164,
      text,
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: null,
      aiGenerated: true,
    })
    return { action: 'confirm_visit' }
  } catch (err) {
    console.warn('[scheduling-agent] excepción (nunca lanza, continuando):', err)
    return { action: 'noop', reason: 'excepción interna' }
  }
}

// Re-exportado por conveniencia (mismo criterio que `analyze-conversation.ts`
// re-exportando de `conversation-memory.ts`): quien orqueste el trigger no
// necesita importar `visit-scheduling.ts` aparte solo para el tipo `Franja`.
export type { Franja }
export { FRANJA_HORA }
