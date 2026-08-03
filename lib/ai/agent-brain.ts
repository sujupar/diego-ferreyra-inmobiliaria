/**
 * EL PROMPT DEL AGENTE — acá se decide qué contesta.
 *
 * ## Qué cambió y por qué (2026-08-03)
 *
 * La primera versión tenía un prompt de ANALISTA: clasificaba la conversación y
 * devolvía el horario "textual tal cual lo dijo el cliente". Quién decidía qué
 * responder no era el modelo, era un parser de expresiones regulares que exigía
 * día Y momento juntos. Resultado real, en la primera prueba con una persona:
 * el agente preguntó "¿qué día y a qué hora?", el cliente contestó "Mañana", y
 * el sistema no supo qué hacer. Un agente conversacional no puede depender de
 * que la gente conteste con la forma exacta que espera un regex.
 *
 * Ahora el modelo decide: entiende la conversación Y redacta la respuesta, en
 * UNA sola llamada. Eso no rompe la regla dura del proyecto (nunca encadenar
 * dos llamadas de IA en un mismo request — ver CLAUDE.md): es la MISMA llamada
 * que ya se hacía para priorizar la bandeja, haciendo el trabajo completo en
 * vez de delegar la mitad en reglas.
 *
 * ## La división de responsabilidades, que es lo importante
 *
 * **El modelo decide qué DECIR. El código decide qué PASA.** El modelo nunca
 * agenda nada: propone. Antes de que una visita entre al CRM, el código
 * verifica por su cuenta que la fecha exista, sea futura y esté dentro de los
 * próximos 90 días (`validateProposedVisit`), y los frenos duros —interruptores,
 * tope de mensajes, ventana de 24hs, visita ya existente— se evalúan en código y
 * MANDAN sobre cualquier cosa que el modelo devuelva. Si el modelo alucina una
 * fecha, no se agenda: se vuelve a preguntar.
 */
import type { ConversationIntent } from '@/lib/admin/ai-usage'

/** Lo que el agente sabe del contexto cuando piensa la respuesta. */
export interface BrainContext {
  /** Nombre de pila del cliente, o null si no lo sabemos. */
  clientName: string | null
  /** Cómo nombrar la propiedad en la conversación ("la casa de Lares de Canning"). */
  propertyLabel: string
  /** Fecha de HOY en Argentina (YYYY-MM-DD). El modelo no la sabe: se la damos. */
  todayISO: string
  /** Resumen acumulado de la conversación (≤400 chars). */
  previousSummary: string
  /** Mensajes nuevos, ya filtrados a lo que el cliente REALMENTE vio. */
  newMessages: Array<{ from: 'cliente' | 'nosotros'; text: string }>
  /** Cuántos mensajes automáticos ya mandó el agente en esta conversación. */
  agentMessagesSent: number
  /** Tope configurado. Al llegar, deja de escribir. */
  maxMessages: number
  /** `true` si esta conversación YA tiene una visita viva en agenda. */
  hasActiveVisit: boolean
  /** Si el agente que ESCRIBE está apagado, el modelo solo analiza (no redacta respuesta). */
  canWrite: boolean
}

/** Lo que devuelve el modelo, ya validado. */
export interface BrainDecision {
  summary: string
  intent: ConversationIntent
  priorityScore: number
  priorityReason: string
  suggestedNextStep: string
  /** Texto EXACTO a mandarle al cliente, o null si no corresponde contestar. */
  reply: string | null
  /** Fecha propuesta por el modelo (YYYY-MM-DD) — SIN validar todavía. */
  visitDate: string | null
  /** Hora en punto (0-23) — SIN validar todavía. */
  visitHour: number | null
}

export const SUMMARY_MAX = 400
/** Un WhatsApp del agente no debería ser un ensayo. Más largo que esto se recorta. */
export const REPLY_MAX = 600

export const DEFAULT_AGENT_PROMPT = `Sos quien atiende por WhatsApp a los interesados de una inmobiliaria en Argentina (Diego Ferreyra Inmobiliaria, CABA y GBA). La persona ya recibió el recorrido de una propiedad y ahora escribe. Tu trabajo es DOS cosas a la vez: entender la conversación para que el equipo la priorice, y redactar la respuesta que se le manda.

CÓMO HABLÁS
- Castellano rioplatense, de vos. Cálido pero directo, como un buen asesor: sin florituras, sin "estimado", sin emojis, sin signos de admiración de más.
- Corto. Dos o tres líneas. Es WhatsApp, no un mail.
- Una sola cosa por mensaje. Si falta el día Y la hora, pedí las dos juntas en una pregunta. Si ya te dijo el día, pedí SOLO la hora y nombrá el día para que se note que lo escuchaste.
- NUNCA prometas un horario firme ni digas que está confirmado. La visita queda propuesta y la confirma el equipo.
- Mencioná que el equipo confirma UNA sola vez, al final, recién cuando ya anotaste la visita. No lo repitas en cada mensaje.
- No inventes datos de la propiedad (precio, medidas, expensas, disponibilidad). Si te preguntan algo que no está en la conversación, decí que lo consulta un asesor y seguí.

TU OBJETIVO
Que la persona diga QUÉ DÍA y A QUÉ HORA puede visitar la propiedad. Nada más.

CUÁNDO NO CONTESTAR
- Si la persona no está pidiendo coordinar una visita (saluda, agradece, dice que después ve), "reply" va en null. No hay que contestar todo.
- Si ya hay una visita en agenda para esta persona y esta propiedad, "reply" va en null: mover o cambiar una visita ya coordinada lo decide una persona del equipo, no vos.
- Si te dicen que no pueden, que no les interesa, o piden hablar con alguien, "reply" va en null.

CUÁNDO ANOTAR LA VISITA
Cuando tengas DÍA y HORA. Ahí devolvés "visitDate" y "visitHour", y en "reply" le confirmás que quedó anotada y que el equipo se comunica para confirmarla.
- "visitDate": fecha en formato YYYY-MM-DD. Calculala vos a partir de HOY, que te paso abajo. Nunca puede ser hoy ni una fecha pasada: la visita más temprana es mañana.
- "visitHour": hora en punto, número entero de 9 a 19. Si te dice "a las 4 de la tarde", son las 16. Si te dice una franja sin hora exacta ("a la tarde"), elegí 15 para la tarde, 12 para el mediodía y 10 para la mañana.
- Si no tenés los dos datos con certeza, dejá los dos en null y preguntá lo que falte. Ante la duda, preguntá: anotar un día que la persona no eligió es el peor error posible.

LOS OTROS CAMPOS (son para el equipo, no para el cliente)
- "summary": reescribí el resumen COMPLETO desde cero, incorporando lo previo más lo nuevo. Máximo 400 caracteres. El próximo análisis va a leer ESTE resumen y no los mensajes de nuevo.
- "intent": uno de "agendar", "consulta", "frio", "desconocido".
- "priorityScore": entero de 0 a 100, qué tan urgente es que un humano intervenga.
- "priorityReason": una frase corta que un asesor entienda de un vistazo.
- "suggestedNextStep": una frase con la acción concreta para el asesor.

Devolvé SIEMPRE un JSON válido con EXACTAMENTE estas 8 claves: summary, intent, priorityScore, priorityReason, suggestedNextStep, reply, visitDate, visitHour.`

/** El contexto de esta conversación, en el formato que lee el modelo. */
export function buildBrainUserPrompt(ctx: BrainContext): string {
  const partes: string[] = [
    `HOY es ${ctx.todayISO} (zona horaria de Argentina). La visita más temprana posible es el día siguiente.`,
    `Propiedad: ${ctx.propertyLabel}`,
    `Cliente: ${ctx.clientName ?? '(no sabemos su nombre — no lo inventes, saludá sin nombre)'}`,
  ]

  if (ctx.hasActiveVisit) {
    partes.push('ATENCIÓN: esta persona YA tiene una visita en agenda para esta propiedad. No propongas ni anotes otra: "reply" va en null.')
  }
  if (!ctx.canWrite) {
    partes.push('ATENCIÓN: hoy no le contestamos automáticamente. Analizá igual, pero "reply" va en null.')
  }
  if (ctx.agentMessagesSent >= ctx.maxMessages) {
    partes.push(`ATENCIÓN: ya se mandaron ${ctx.agentMessagesSent} mensajes automáticos (el tope es ${ctx.maxMessages}). "reply" va en null: sigue una persona.`)
  } else if (ctx.agentMessagesSent > 0) {
    partes.push(`Mensajes automáticos ya enviados en esta conversación: ${ctx.agentMessagesSent} de ${ctx.maxMessages}.`)
  }

  partes.push(
    `Resumen previo:\n${ctx.previousSummary.trim() || '(sin resumen previo — es la primera vez que se analiza esta conversación)'}`,
  )
  partes.push(
    `Mensajes nuevos (${ctx.newMessages.length}):\n` +
      (ctx.newMessages.length > 0
        ? ctx.newMessages.map(m => `[${m.from === 'cliente' ? 'Cliente' : 'Nosotros'}] ${m.text}`).join('\n')
        : '(ninguno)'),
  )
  return partes.join('\n\n')
}

const VALID_INTENTS: ConversationIntent[] = ['agendar', 'consulta', 'frio', 'desconocido']

/**
 * Valida la respuesta cruda del modelo. Devuelve `null` si le falta lo
 * mínimo — mejor sin análisis que con basura.
 */
export function coerceBrainDecision(raw: unknown): BrainDecision | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.summary !== 'string' || typeof r.priorityReason !== 'string') return null

  const intent = VALID_INTENTS.includes(r.intent as ConversationIntent)
    ? (r.intent as ConversationIntent)
    : 'desconocido'
  const scoreRaw = typeof r.priorityScore === 'number' ? r.priorityScore : Number(r.priorityScore)
  const priorityScore = Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : 0

  const replyRaw = typeof r.reply === 'string' ? r.reply.trim() : ''
  const reply = replyRaw.length > 0 ? replyRaw.slice(0, REPLY_MAX) : null

  const visitDate = typeof r.visitDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.visitDate.trim())
    ? r.visitDate.trim()
    : null
  const hourRaw = typeof r.visitHour === 'number' ? r.visitHour : Number(r.visitHour)
  const visitHour = Number.isInteger(hourRaw) ? hourRaw : null

  return {
    summary: r.summary.trim().slice(0, SUMMARY_MAX),
    intent,
    priorityScore,
    priorityReason: r.priorityReason.trim(),
    suggestedNextStep: typeof r.suggestedNextStep === 'string' ? r.suggestedNextStep.trim() : '',
    reply,
    visitDate,
    visitHour,
  }
}

export type VisitValidation =
  | { ok: true; dateISO: string; hour: number }
  | { ok: false; reason: string }

/**
 * El código verifica la fecha por su cuenta ANTES de que una visita entre al
 * CRM. El modelo propone; esto decide. Un modelo puede equivocarse de año,
 * calcular mal un día de semana o inventar el 31 de febrero — y la
 * consecuencia sería una persona parada frente a una propiedad un día que
 * nadie eligió.
 *
 * Los límites son los MISMOS que ya aplica el formulario público
 * (`/v/<token>/schedule`): desde mañana y hasta 90 días.
 */
export function validateProposedVisit(
  dateISO: string | null,
  hour: number | null,
  todayISO: string,
): VisitValidation {
  if (!dateISO || hour === null) return { ok: false, reason: 'faltan el día o la hora' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { ok: false, reason: 'la fecha no tiene un formato válido' }

  // Ida y vuelta: atrapa fechas que no existen (31 de febrero se normalizaría a marzo).
  const d = new Date(`${dateISO}T12:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dateISO) {
    return { ok: false, reason: 'esa fecha no existe' }
  }
  const hoy = new Date(`${todayISO}T12:00:00Z`)
  const dias = Math.round((d.getTime() - hoy.getTime()) / 86_400_000)
  if (dias < 1) return { ok: false, reason: 'la visita más temprana es mañana' }
  if (dias > 90) return { ok: false, reason: 'la fecha está a más de 90 días' }
  if (!Number.isInteger(hour) || hour < 9 || hour > 19) {
    return { ok: false, reason: 'la hora está fuera del horario de visitas (9 a 19)' }
  }
  return { ok: true, dateISO, hour }
}
