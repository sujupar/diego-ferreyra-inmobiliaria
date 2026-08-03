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
 * puede calcular sin IA, se calcula sin IA" — armar la fecha de una
 * `property_visits` es aritmética de calendario, no un juicio.
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
 *     mandaban el MISMO texto dos veces y dejaban el contador en 1. El cupo se
 *     DEVUELVE en un solo caso: cuando el envío responde `skipped` (modo
 *     prueba / sin credenciales), o sea cuando no salió nada — ver
 *     `releaseMessageSlot`. Ante un error real de Meta queda consumido.
 *   - Con una visita VIVA y VIGENTE ya anotada para esa propiedad y ese
 *     teléfono, el agente DEJA de proponer y de confirmar. No adivina si el
 *     cliente quiere moverla: correrle la fecha a una visita que el asesor ya
 *     tiene en agenda es decisión de una persona. "Viva" es cualquiera de
 *     `VISITA_ACTIVA_STATUSES` (propuesta o ya confirmada); "vigente" tiene
 *     definición explícita (`visitaVigente`): una fila cuya fecha ya pasó no es
 *     una visita en agenda y no puede dejar al agente mudo para siempre. Si esa
 *     lectura NO SE PUEDE HACER, el agente tampoco escribe: no saber si hay
 *     visita no es lo mismo que saber que no la hay.
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
  scheduledAtFor,
  scheduledAtHora,
  upsertPendingVisit,
  notifyAndAdvancePipeline,
} from '@/lib/leads/visit-scheduling'
import { serviceWindow } from '@/lib/integrations/whatsapp/window'
import { sendWhatsappText } from '@/lib/integrations/whatsapp/core'
import { logOutbound } from '@/lib/integrations/whatsapp/log'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import { updateAgentState, getConversationAiState } from '@/lib/ai/conversation-memory'
import { runConversationAnalysis } from '@/lib/ai/analyze-conversation'
import { validateProposedVisit } from '@/lib/ai/agent-brain'

// ---------------------------------------------------------------------------
// Parser determinístico de "cuándo" — nunca IA. Entiende los patrones de
// castellano rioplatense más comunes para coordinar una visita. Ante
// cualquier ambigüedad, devuelve `null` (no adivina): el agente prefiere
// volver a preguntar el día y la hora a agendar mal.
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

/**
 * Marcas de NEGACIÓN del castellano rioplatense. El prompt del análisis
 * (`analyze-conversation.ts`) le pide al modelo el slot "textual tal cual lo
 * dijo" el cliente, así que un "no puedo mañana a la tarde" llega ENTERO hasta
 * acá: el parser veía "manana" + "a la tarde", no miraba el "no" y el agente
 * contestaba "Anoté tu visita para mañana por la tarde" — le agendaba justo el
 * momento en el que el cliente dijo que NO podía. Es el peor error que puede
 * cometer esta pieza.
 *
 * Resolver una negación es un JUICIO ("el martes no, el miércoles sí": ¿qué
 * franja?, ¿el miércoles de esta semana?) y este parser no hace juicios. Ante
 * cualquier negación devuelve `null`, que hace que el agente vuelva a preguntar
 * qué día y a qué hora — exactamente lo que corresponde responderle a un "no
 * puedo".
 */
const NEGACION_RE = /\b(no|ni|nunca|tampoco|imposible|salvo|excepto|menos|evitar|evito)\b/

/**
 * Locuciones que CONTIENEN una palabra de las listas de abajo sin negar ni
 * nombrar una franja: "mañana a la tarde, más o menos" no es una negación, y
 * "buenas tardes, el jueves" no es una visita a la tarde. Se sacan del texto
 * antes de mirar nada — si no, el saludo terminaba eligiendo la franja.
 */
const NO_NIEGAN_RE = /\b(mas o menos|buenas? noches?|buenas? tardes?|buenos? dias?)\b/g

/**
 * Horas del día que NO tienen franja en este sistema: `FRANJA_HORA` solo
 * conoce mañana (9), mediodía (12) y tarde (15). "el jueves a las 9 de la
 * noche" leía el "9" y confirmaba "por la mañana" — doce horas de diferencia
 * con lo que el cliente pidió. Sin franja honesta, se vuelve a preguntar.
 */
const NOCTURNO_RE = /\b(noche|nochecita|medianoche|madrugada)\b/

/**
 * "tarde" como ADVERBIO ("más tarde", "llego tarde", "perdón por contestar
 * tarde", "tarde o temprano"), que en castellano rioplatense no tiene nada que
 * ver con la franja horaria. Era el error más frecuente del parser: cualquier
 * día de semana + un "tarde" suelto disparaba la confirmación, así que "el
 * jueves te confirmo más tarde" se contestaba con "Anoté tu visita para el
 * jueves 6/8 por la tarde" — el cliente estaba pidiendo TIEMPO, no un horario.
 *
 * Se aplica DESPUÉS de la forma con preposición ("a la tarde", "por la tarde"),
 * que es la única en la que "tarde" sí nombra la franja: así "llego un poco
 * tarde el martes a la tarde" sigue confirmando bien, y solo se descarta el
 * "tarde" que quedó suelto.
 */
const TARDE_ADVERBIAL_RE =
  /\b(?:(?:mas|muy|un poco|medio|re|bastante|algo)\s+tarde|tarde o temprano|se (?:me|nos) hizo tarde|(?:lleg|contest|respond|avis|escrib|confirm|dig)\w*(?:\s+\w+){0,2}\s+tarde)\b/g

/**
 * Referencias a una semana que no es esta. El parser resuelve "el martes" como
 * el PRÓXIMO martes, así que "el martes de la semana que viene" se confirmaba
 * una semana antes de lo pedido — el cliente se planta en la propiedad el día
 * equivocado. Calcular "la semana que viene" tiene reglas culturales que este
 * parser no va a acertar (¿el viernes que viene es dentro de 7 días o el de
 * esta semana?), así que se pregunta.
 */
const OTRA_SEMANA_RE = /\b(que viene|proxim\w+|la otra semana|la semana entrante|dentro de|en \d+\s*(?:dias?|semanas?))\b/

/**
 * Horario en el que se visita una propiedad. Una hora suelta fuera de este
 * rango es ambigua ("a las 7" tanto puede ser 7 de la mañana como 7 de la
 * tarde) o directamente no se puede agendar: ante la duda, se pregunta.
 */
// El piso es 9 y no 8 a propósito: "a las 8" es tan ambiguo como "a las 7"
// (8 de la mañana / 8 de la noche) y se confirmaba en silencio como la mañana.
// Con "a las 8 de la mañana" el cliente lo dice explícito y esa forma sigue
// funcionando — la franja la fija "de la mañana", no el número.
const HORA_MIN_VISITA = 9
const HORA_MAX_VISITA = 19

/** Próxima fecha (>= mañana) que cae en `targetDow`. Si hoy ES ese día, salta a la semana que viene. */
function nextWeekday(todayISO: string, targetDow: number): string {
  for (let k = 1; k <= 7; k++) {
    const candidate = sumarDias(todayISO, k)
    if (diaDeSemana(candidate) === targetDow) return candidate
  }
  return sumarDias(todayISO, 7) // inalcanzable — todo dow aparece dentro de 7 días
}

/**
 * Hora → franja, mismo bucket que `franjaLabelFromDate` de `visit-proposed.ts`.
 * Solo tiene sentido DENTRO de `HORA_MIN_VISITA`..`HORA_MAX_VISITA`: quien
 * llama valida el rango antes, porque acá cualquier número devuelve una franja
 * (las 23 caían en "tarde" y las 3 de la madrugada en "mañana").
 */
function franjaFromHour(hour: number): Franja {
  if (hour <= 10) return 'manana'
  if (hour <= 13) return 'mediodia'
  return 'tarde'
}

export interface ParsedSlot {
  dateISO: string
  /** Ausente = el cliente dijo el día pero no el momento. Ver `parseProposedSlot`. */
  franja?: Franja
  /**
   * Hora EXACTA, solo cuando el cliente la dijo ("el jueves a las 16"). Sin
   * esto se guardaba la hora por default de la franja (tarde = 15) y el asesor
   * veía un horario que el cliente nunca mencionó. Si el cliente habló de
   * franja ("a la tarde"), queda `undefined` y manda el default de siempre.
   */
  hora?: number
}

/**
 * Pura. Intenta extraer día + franja de un texto libre ("mañana a la tarde",
 * "el sábado a las 10", "pasado mañana por la mañana"). `null` si no puede
 * determinar AMBOS con confianza — eso es una señal para volver a preguntar
 * con opciones concretas, no para adivinar.
 *
 * TRES formas de "no puedo determinarlo con confianza", y las tres devuelven
 * `null` porque confirmar de más es infinitamente más caro que preguntar de
 * más (el cliente se planta en la propiedad un día que no eligió):
 *   1. NEGACIÓN en el texto (`NEGACION_RE`) — el cliente está descartando, no
 *      eligiendo.
 *   2. Un momento sin franja posible (`NOCTURNO_RE`, horas fuera del horario de
 *      visitas) — no hay a qué mapearlo sin inventar.
 *   3. VARIAS opciones sobre la mesa ("el martes o el jueves", "a la mañana o a
 *      la tarde") — elegir por el cliente es confirmarle algo que no dijo.
 *      Antes ganaba la primera de la lista: "el miércoles o el martes" se
 *      confirmaba como martes solo porque martes viene antes en `WEEKDAYS`.
 */
export function parseProposedSlot(rawText: string, now: Date): ParsedSlot | null {
  let working = normalizeText(rawText).replace(NO_NIEGAN_RE, ' ')

  if (NEGACION_RE.test(working)) return null
  if (NOCTURNO_RE.test(working)) return null
  if (OTRA_SEMANA_RE.test(working)) return null

  // Se junta TODA franja nombrada, no la primera: si el texto nombra más de
  // una, el cliente no eligió (ver punto 3 del comentario de arriba).
  const franjas = new Set<Franja>()

  // Franja explícita ligada a "a la"/"por la"/"de la"/"en la" — se consume del
  // texto ANTES de buscar el día, porque "mañana" es AMBIGUO en castellano
  // (día siguiente vs. franja de la mañana) y este patrón desambigua.
  working = working.replace(/\b(?:a|por|de|en)\s+la\s+(tarde|manana)\b/g, (_m, f: string) => {
    franjas.add(f === 'tarde' ? 'tarde' : 'manana')
    return ' '
  })
  working = working.replace(/\bmedio\s?dia\b/g, () => {
    franjas.add('mediodia')
    return ' '
  })
  // Los "tarde" adverbiales se sacan ANTES de que el `tarde` suelto de abajo
  // los tome por una franja. Ver `TARDE_ADVERBIAL_RE`.
  working = working.replace(TARDE_ADVERBIAL_RE, ' ')
  working = working.replace(/\btarde\b/g, () => {
    franjas.add('tarde')
    return ' '
  })

  // La hora solo define la franja cuando el cliente NO la nombró: en "a las 5
  // de la tarde" manda la tarde, no las 5 de la mañana.
  const horas = new Set<number>()
  if (franjas.size === 0) {
    for (const m of working.matchAll(/\ba\s*las?\s*(\d{1,2})/g)) {
      const hora = parseInt(m[1], 10)
      if (hora < HORA_MIN_VISITA || hora > HORA_MAX_VISITA) return null
      horas.add(hora)
      franjas.add(franjaFromHour(hora))
    }
  }
  if (franjas.size === 0 && /\btemprano\b/.test(working)) franjas.add('manana')

  const today = hoyEnArgentina(now)
  const dias = new Set<string>()
  working = working.replace(/\bpasado\s+manana\b/g, () => {
    dias.add(sumarDias(today, 2))
    return ' '
  })
  // Un "pasado" que sobrevivió al reemplazo de arriba es una referencia a un
  // día que no podemos resolver: puede ser "pasado" a secas (= pasado mañana,
  // como en "mañana o pasado") o mirar al PASADO ("el martes pasado"). En el
  // primer caso el cliente encima está ofreciendo DOS días, así que elegir uno
  // es confirmarle algo que no dijo. Se pregunta.
  if (/\bpasado\b/.test(working)) return null
  for (const w of WEEKDAYS) {
    if (new RegExp(`\\b${w.name}\\b`).test(working)) dias.add(nextWeekday(today, w.dow))
  }
  if (/\bmanana\b/.test(working)) dias.add(sumarDias(today, 1))
  // "hoy" deliberadamente NO resuelve una fecha: el sistema nunca agenda
  // para el mismo día (mismo piso que `/v/[token]/schedule`, MIN = mañana).

  // Un solo día y una sola franja, o no hay nada que confirmar. El Set también
  // resuelve gratis los casos redundantes ("mañana martes a la tarde": las dos
  // referencias caen en la MISMA fecha, así que sigue siendo una sola).
  if (dias.size !== 1) return null
  const dateISO = [...dias][0]
  // Un DÍA sin momento del día es media respuesta, no un fracaso: "mañana" es
  // exactamente lo que contesta la gente. Se devuelve el día solo, y el agente
  // pregunta únicamente la hora en vez de repetir la pregunta entera (caso real
  // de la prueba del dueño, 2026-08-03).
  if (franjas.size !== 1) return { dateISO }
  // Dos horas nombradas ("entre las 10 y las 12") es un rango, no una hora: se
  // guarda la franja y el equipo cierra el horario. Una sola, se respeta tal cual.
  const hora = horas.size === 1 ? [...horas][0] : undefined
  return { dateISO, franja: [...franjas][0], hora }
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


// ---------------------------------------------------------------------------
// Decisión — pura, testeable sin red. Ver `SchedulingAction` para el
// contrato completo de qué puede devolver.
// ---------------------------------------------------------------------------

export type SchedulingAction =
  | { type: 'noop'; reason: string }
  | { type: 'handoff'; reason: string }
  /** Hay algo que contestar. El TEXTO lo escribió el modelo; la visita, si viene, ya la validó el código. */
  | { type: 'reply'; text: string; visit?: { dateISO: string; hour: number } }

export interface SchedulingContext {
  now: Date
  /** Texto que el modelo quiere mandar. `null` = el modelo decidió no contestar. */
  reply: string | null
  /** Visita ya VALIDADA por `validateProposedVisit`. Ausente = no hay nada que agendar en este turno. */
  visit?: { dateISO: string; hour: number }
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
  if (ctx.agentMessagesSent >= ctx.maxMessagesPerConversation) {
    return {
      type: 'handoff',
      reason: `se alcanzó el tope de ${ctx.maxMessagesPerConversation} mensajes automáticos sin cerrar el agendamiento`,
    }
  }

  // El último freno lo pone el propio modelo: decidió que no hay nada que
  // contestar (un "ok", un "gracias", o un tema que le corresponde a una
  // persona). Un agente que contesta TODO es tan malo como uno mudo.
  if (!ctx.reply) {
    return { type: 'noop', reason: 'no hay nada que contestar en este turno' }
  }
  return ctx.visit
    ? { type: 'reply', text: ctx.reply, visit: ctx.visit }
    : { type: 'reply', text: ctx.reply }
}

// ---------------------------------------------------------------------------
// Prosa — castellano rioplatense, cálido y profesional. Nunca promete
// horario firme: siempre cierra con que el equipo confirma.
// ---------------------------------------------------------------------------

function firstName(name: string | null): string {
  const trimmed = (name ?? '').trim()
  return trimmed ? trimmed.split(/\s+/)[0] : ''
}

/**
 * El agente PREGUNTA día y hora — no ofrece una lista de franjas.
 *
 * Antes mandaba cuatro opciones numeradas y decía "coordino el horario exacto
 * con nuestro equipo". Decisión del dueño (2026-08-04): sacar esa vuelta. El
 * agente hace UNA cosa, la pregunta es abierta (el cliente elige, no encaja en
 * nuestra grilla) y el aviso de que el equipo confirma va UNA sola vez, al
 * final, cuando la visita ya quedó anotada. Repetirlo en cada mensaje suena a
 * formulario, no a alguien atendiendo.
 */
export function buildAskWhenMessage(clientName: string | null, propertyLabel: string): string {
  const nombre = firstName(clientName)
  const saludo = nombre ? `Hola, ${nombre}.` : 'Hola.'
  return `${saludo} ¿Qué día y a qué hora te queda bien para visitar ${propertyLabel}?`
}

/**
 * El cliente dijo el día pero no la hora. Se pregunta SOLO lo que falta,
 * nombrando el día: repetir "¿qué día y a qué hora?" después de que contestó
 * "mañana" da la sensación de que no lo escucharon.
 */
export function buildAskTimeMessage(clientName: string | null, dateISO: string, now: Date): string {
  const nombre = firstName(clientName)
  const saludo = nombre ? `Perfecto, ${nombre}.` : 'Perfecto.'
  return `${saludo} ¿A qué hora te queda bien ${dayWord(dateISO, hoyEnArgentina(now))}?`
}

/** "a las 16" si el cliente dijo la hora; si habló de franja, la franja. */
function momentoLabel(franja: Franja, hora?: number): string {
  return hora !== undefined ? `a las ${hora}` : FRANJA_LABEL_PROSA[franja]
}

export function buildConfirmMessage(
  clientName: string | null,
  propertyLabel: string,
  dateISO: string,
  franja: Franja,
  now: Date,
  hora?: number,
): string {
  const nombre = firstName(clientName)
  const saludo = nombre ? `Listo, ${nombre}.` : 'Listo.'
  const dia = dayWord(dateISO, hoyEnArgentina(now))
  return `${saludo} Anoté la visita a ${propertyLabel} para ${dia} ${momentoLabel(franja, hora)}. El equipo se comunica para confirmarla.`
}

/** Nota INTERNA (no se manda al cliente) — visible en el chat del Inbox para que un asesor sepa que a partir de acá sigue una persona. */
export function buildHandoffNote(max: number): string {
  return `[Agente IA] Se alcanzó el tope de ${max} mensajes automáticos en esta conversación sin cerrar el agendamiento. A partir de acá sigue una persona del equipo — el agente no vuelve a escribir en este chat.`
}

/**
 * Nota INTERNA. El cliente sigue hablando de una visita que YA está en agenda:
 * el agente se calla y avisa acá adentro. `fecha` en formato "4/8" (o `null` si
 * la visita no tiene fecha legible).
 *
 * El texto distingue PROPUESTA de CONFIRMADA porque no son la misma noticia
 * para el asesor que lee el Inbox: sobre una propuesta todavía hay algo que
 * cerrar; sobre una confirmada, el cliente está hablando de algo que el equipo
 * ya cerró con él. Decir "todavía sin confirmar" de una visita confirmada sería
 * mentirle al asesor.
 */
export function buildActiveVisitNote(fecha: string | null, status: string): string {
  const cuando = fecha ? ` para el ${fecha}` : ''
  const estado =
    status === 'scheduled'
      ? `ya está confirmada${cuando}`
      : `ya está propuesta${cuando} y todavía sin confirmar`
  return `[Agente IA] El cliente sigue escribiendo sobre una visita que ${estado}. El agente no vuelve a proponer ni a confirmar horarios de esta propiedad: mover una visita que el equipo ya tiene en agenda lo decide una persona.`
}

/**
 * Nota INTERNA. No se pudo LEER si este cliente ya tenía una visita en agenda
 * para esta propiedad (PostgREST/RLS/red). Ante esa duda el agente no crea nada
 * ni le escribe: el riesgo del otro lado es crear una visita DUPLICADA, mandar
 * un segundo mail al equipo y escribirle al cliente como si fuera la primera
 * vez. La nota existe porque callarse sin dejar rastro es la otra forma de
 * fallar — nadie se enteraría de que el cliente pidió coordinar.
 */
export function buildVisitLookupFailedNote(error: string): string {
  return `[Agente IA] El cliente pidió coordinar una visita y NO se pudo verificar si ya tenía una anotada para esta propiedad (${error}). Por las dudas el agente no le contestó ni registró nada — hay que responderle y coordinarla a mano.`
}

/**
 * Nota INTERNA. No se pudo guardar la visita, así que al cliente NO se le dijo
 * nada — ese es el punto de la nota: alguien tiene que coordinarla a mano.
 */
export function buildVisitFailedNote(error: string): string {
  return `[Agente IA] El cliente pidió coordinar una visita y NO se pudo registrar (${error}). No se le confirmó nada por WhatsApp — hay que contestarle y coordinarla a mano.`
}

/**
 * Por qué el agente no llegó a mandar el mensaje que tenía listo. Son DOS cosas
 * distintas y antes se contaban como una sola: `claimMessageSlot` devolvía
 * `null` tanto cuando no quedaba cupo como cuando la RPC de reserva fallaba, y
 * las notas internas afirmaban siempre "se agotó el cupo". Eso mandaba al asesor
 * a mirar el tope de mensajes cuando el problema real era la base.
 */
export type ClaimFailure = 'sin_cupo' | 'fallo_reserva'

/** Causa en prosa, para las notas internas. Es la ÚNICA fuente del texto — no repetirlo suelto. */
const CLAIM_FAILURE_CAUSA: Record<ClaimFailure, string> = {
  sin_cupo: 'se agotó el cupo de mensajes automáticos',
  fallo_reserva: 'falló la reserva del cupo de mensajes automáticos',
}

/**
 * Nota INTERNA. El caso al revés de `buildVisitFailedNote`: la visita SÍ quedó
 * guardada y el equipo YA recibió el mail, pero al cliente no se le pudo
 * responder. Sin esta nota ese camino no dejaba NINGÚN rastro en el chat — a
 * diferencia de todos los otros caminos anómalos — y el cliente se quedaba
 * esperando una respuesta que nadie sabía que faltaba.
 */
export function buildVisitUnconfirmedNote(dia: string, franjaLabel: string, causa: ClaimFailure): string {
  return `[Agente IA] La visita quedó registrada para ${dia} ${franjaLabel} y el equipo ya recibió el aviso, pero NO se le pudo confirmar al cliente por WhatsApp (${CLAIM_FAILURE_CAUSA[causa]}). Hay que escribirle para cerrarla.`
}

/**
 * Nota INTERNA del camino de PROPONER franjas. Existe por simetría con el de
 * confirmar: ahí, quedarse sin cupo ya dejaba rastro, y acá el agente se
 * callaba en silencio. Es el mismo hecho de negocio —el cliente pidió coordinar
 * y nadie le contestó— así que tiene que verse igual en el Inbox.
 */
export function buildProposeUnsentNote(causa: ClaimFailure): string {
  return `[Agente IA] El cliente pidió coordinar una visita y NO se le pudieron mandar las opciones de día (${CLAIM_FAILURE_CAUSA[causa]}). No se registró ninguna visita — hay que escribirle para coordinarla.`
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
  now?: Date
}

export interface RunSchedulingAgentResult {
  action: SchedulingAction['type']
  reason?: string
}

/**
 * Prefijo de TODOS los status de nota interna del agente en `whatsapp_messages`
 * — filas SALIENTES que NUNCA se le mandan al cliente.
 *
 * Es el contrato con el Inbox (`components/inbox/MessageBubble.tsx`), y es un
 * PREFIJO y no una lista a propósito. La lista estaba copiada a mano allá y
 * quedó vieja: de los seis status, el componente conocía cuatro, así que
 * `agent_visit_lookup_failed` y `agent_propose_unsent` caían en el `default` y
 * se dibujaban con el mismo verde de un mensaje enviado, con el string crudo en
 * pantalla. Un asesor leía como "se le mandó esto al cliente" algo que nunca
 * salió. Con el prefijo, un séptimo status queda bien tratado el día que se
 * agregue, sin tocar el componente.
 *
 * (El componente NO importa estas constantes aunque sea lo más obvio: es
 * `'use client'` y este módulo arrastra `@supabase/supabase-js` y la cadena de
 * mails —que incluye `import 'server-only'`— hasta el bundle del navegador. El
 * contrato se sostiene con un test de cada lado: acá, que todo status del
 * agente arranca con este prefijo; en `MessageBubble.test.tsx`, que cualquier
 * `agent_*` se dibuja como nota interna.)
 */
export const AGENT_NOTE_STATUS_PREFIX = 'agent_'

/** Status de las notas INTERNAS del agente en `whatsapp_messages` (nunca se le mandan al cliente). */
const NOTE_STATUS_HANDOFF = 'agent_handoff'
const NOTE_STATUS_PENDING_VISIT = 'agent_visit_pending'
const NOTE_STATUS_VISIT_FAILED = 'agent_visit_failed'
const NOTE_STATUS_VISIT_UNCONFIRMED = 'agent_visit_unconfirmed'
const NOTE_STATUS_VISIT_LOOKUP_FAILED = 'agent_visit_lookup_failed'
const NOTE_STATUS_PROPOSE_UNSENT = 'agent_propose_unsent'

/**
 * Los seis, en un solo lugar. Fuente de verdad para los tests del Inbox: si
 * mañana se suma un séptimo status y el componente no lo dibuja como nota
 * interna, el test de `MessageBubble` se pone en rojo solo.
 */
export const AGENT_NOTE_STATUSES = [
  NOTE_STATUS_HANDOFF,
  NOTE_STATUS_PENDING_VISIT,
  NOTE_STATUS_VISIT_FAILED,
  NOTE_STATUS_VISIT_UNCONFIRMED,
  NOTE_STATUS_VISIT_LOOKUP_FAILED,
  NOTE_STATUS_PROPOSE_UNSENT,
] as const

export type AgentNoteStatus = (typeof AGENT_NOTE_STATUSES)[number]

/**
 * Estados de `property_visits` que significan "hay una visita VIVA con este
 * cliente en esta propiedad" (CHECK completo en la migración
 * `20260728000001`: pending_confirmation, scheduled, completed, no_show,
 * cancelled).
 *
 * Va `scheduled` además de `pending_confirmation` porque apenas el asesor
 * CONFIRMA la visita (`PATCH /api/visits/[id]`) la fila pasa a `scheduled`, y
 * con el freno viejo el agente se destrababa justo ahí: un "gracias, nos vemos"
 * después de confirmada volvía a marcar intención de agendar y el agente podía
 * proponer —o crear— otra visita arriba de una que el asesor ya tenía cerrada
 * con el cliente. Ese es el peor caso posible de todos.
 *
 * `cancelled`, `completed` y `no_show` NO frenan: ahí no queda nada en agenda,
 * y si el cliente vuelve a escribir para coordinar, coordinar es exactamente lo
 * que corresponde.
 */
const VISITA_ACTIVA_STATUSES: string[] = ['pending_confirmation', 'scheduled']

export interface ExistingActiveVisit {
  id: string
  /** `pending_confirmation` o `scheduled` — cambia el texto de la nota interna. */
  status: string
  /** "4/8" — para la nota interna. `null` si la fila no tiene `scheduled_at` legible. */
  fecha: string | null
  /**
   * `created_at` de la visita: el corte del EPISODIO. Las notas internas de
   * "ya hay visita en agenda" se deduplican SOLO contra las posteriores a este
   * instante — ver `yaHayNotaInterna`.
   */
  desdeISO: string
}

/**
 * Resultado de buscar una visita ya en agenda. Existe por la MISMA razón que
 * `ConversationAiStateRead` en `lib/ai/conversation-memory.ts`: `null` a secas
 * mezclaba "no hay ninguna visita" (normal) con "no pude leer la tabla" (hipo
 * de red, RLS, PostgREST caído), y este agente es la única pieza del sistema
 * que le escribe sola a un cliente real. Con el empate, un error de lectura se
 * leía como vía libre: visita DUPLICADA, segundo mail al equipo y un WhatsApp
 * al cliente como si fuera la primera vez. Quien la llame tiene que frenar ante
 * `readFailed: true`, no seguir de largo.
 */
export interface ExistingActiveVisitRead {
  /** La visita, o `null` si no hay ninguna. Solo significa eso si `readFailed` es `false`. */
  visit: ExistingActiveVisit | null
  /** `true` = NO se pudo leer. Acá no sabemos nada: no se manda ni se crea nada. */
  readFailed: boolean
  /** Motivo de la falla, para la nota interna. */
  error: string | null
}

/**
 * Cuánto hacia atrás sigue contando como "visita en agenda". El freno existe
 * para no correrle la fecha a una visita que el asesor YA tiene anotada; una
 * cuya fecha ya pasó no es eso: es una fila que nadie confirmó ni canceló.
 *
 * 24hs de tolerancia y no 0 porque el caso real es el cliente que escribe
 * DESPUÉS de la hora ("se me hizo tarde", "¿seguimos en pie?"): esa visita
 * sigue siendo la conversación del momento y el agente no tiene que proponer
 * otra ni crear una segunda fila. Más allá de eso, si nadie la tocó en un día,
 * es basura que quedó y no puede dejar al agente mudo para siempre.
 */
const VISITA_VIGENTE_TOLERANCIA_MS = 24 * 60 * 60 * 1000

/** ¿Esta visita sigue siendo una visita en agenda, o es basura vieja? */
function visitaVigente(scheduledAt: string | null, now: Date): boolean {
  // `property_visits.scheduled_at` es NOT NULL (migración `20260513000001`), así
  // que esto es defensivo: sin fecha no se puede PROBAR que esté vencida, y ante
  // la duda el freno se mantiene (callarse es más barato que agendar dos veces).
  if (!scheduledAt) return true
  const t = new Date(scheduledAt).getTime()
  if (Number.isNaN(t)) return true
  return t >= now.getTime() - VISITA_VIGENTE_TOLERANCIA_MS
}

/**
 * Visita VIVA (`VISITA_ACTIVA_STATUSES`) de ESTA propiedad para ESTE teléfono.
 *
 * OJO — por qué no se filtra por `client_phone` en la query: la visita que el
 * cliente crea solo desde `/v/<token>` guarda el teléfono TAL CUAL lo tipeó
 * ("11 2233-4455"), no el E.164 del WhatsApp. Comparar exacto no matcheaba
 * NUNCA → se creaba una SEGUNDA visita contradictoria y salía un segundo mail
 * al equipo. Mismo patrón que `findLeadIdByPhone` en el webhook: se trae un
 * puñado de candidatas (las visitas vivas de una propiedad son pocas por
 * definición) y la coincidencia REAL la decide `normalizeWhatsappPhone`, que es
 * exacta y no da falsos positivos por sufijo parecido.
 *
 * Solo cuentan las visitas VIGENTES (`visitaVigente`): una de hace tres meses
 * que nadie confirmó ni canceló dejaba al agente mudo PARA SIEMPRE con ese
 * cliente. Ese filtro va en memoria y no en la query a propósito — así el
 * criterio de "vigente" queda en UN solo lugar, testeado, en vez de repartido
 * entre el SQL y el código. El de `status`, en cambio, SÍ va en la query: es una
 * lista fija de la migración y descarta filas que no queremos ni traer.
 *
 * FAIL-CLOSED: ante un error de lectura devuelve `readFailed: true`, NUNCA
 * `visit: null`. Ver `ExistingActiveVisitRead` para por qué eso importa tanto.
 */
async function findExistingActiveVisit(
  sb: ReturnType<typeof admin>,
  propertyId: string,
  phoneE164: string,
  now: Date,
): Promise<ExistingActiveVisitRead> {
  try {
    const { data, error } = await sb
      .from('property_visits')
      .select('id, client_phone, scheduled_at, created_at, status')
      .eq('property_id', propertyId)
      .in('status', VISITA_ACTIVA_STATUSES)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.warn(
        '[scheduling-agent] no se pudo leer si ya hay una visita en agenda — no se manda nada (fail-closed):',
        error.message,
      )
      return { visit: null, readFailed: true, error: error.message }
    }
    const rows =
      (data as Array<{
        id: string
        client_phone: string | null
        scheduled_at: string | null
        created_at: string | null
        status: string | null
      }> | null) ?? []
    for (const row of rows) {
      if (normalizeWhatsappPhone(row.client_phone) !== phoneE164) continue
      if (!visitaVigente(row.scheduled_at, now)) continue
      return {
        visit: {
          id: row.id,
          status: row.status ?? 'pending_confirmation',
          fecha: fechaCortaArgentina(row.scheduled_at),
          // Sin `created_at` legible el corte cae al instante actual: peor caso,
          // la nota interna se repite una vez. Ver `yaHayNotaInterna`.
          desdeISO: row.created_at ?? now.toISOString(),
        },
        readFailed: false,
        error: null,
      }
    }
    return { visit: null, readFailed: false, error: null }
  } catch (err) {
    console.warn('[scheduling-agent] excepción leyendo las visitas en agenda — no se manda nada (fail-closed):', err)
    return { visit: null, readFailed: true, error: err instanceof Error ? err.message : 'error desconocido' }
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

/**
 * ¿Ya dejamos esta nota interna EN ESTE EPISODIO? Evita repetirla en cada
 * mensaje del cliente, sin silenciarla para siempre.
 *
 * `desdeISO` es el corte y es lo que arregla el agujero: antes se deduplicaba
 * por (teléfono, propiedad, status) SIN ninguna ventana, así que la nota se
 * escribía UNA vez en la historia de esa conversación. Un segundo episodio de
 * agendamiento semanas después —otra visita, otro pedido del cliente— no
 * generaba ningún aviso y nadie se enteraba de que estaba pidiendo coordinar.
 * Ahora el corte es el `created_at` de la visita que motiva la nota: una visita
 * distinta = una nota nueva.
 *
 * Ante ERROR de lectura devuelve `false`, o sea SE ESCRIBE. Es una nota
 * INTERNA: una repetida es ruido tolerable en el Inbox, una faltante es un
 * cliente que nadie atiende. (El criterio anterior era el opuesto y estaba mal
 * justificado — trataba el ruido como más caro que el silencio.)
 */
async function yaHayNotaInterna(
  sb: ReturnType<typeof admin>,
  phoneE164: string,
  propertyId: string,
  status: string,
  desdeISO: string,
): Promise<boolean> {
  try {
    const { data, error } = await sb
      .from('whatsapp_messages')
      .select('id')
      .eq('phone_e164', phoneE164)
      .eq('property_id', propertyId)
      .eq('status', status)
      .gte('created_at', desdeISO)
      .limit(1)
      .maybeSingle()
    if (error) return false
    return data !== null
  } catch {
    return false
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
 * `null` y el agente no escribe. Y si el envío falla DESPUÉS de reservar, el
 * cupo queda consumido: es el lado seguro del error — este agente puede mandar
 * de menos, nunca de más. La ÚNICA excepción es el envío `skipped`, que se
 * devuelve: ver `releaseMessageSlot`.
 *
 * Devuelve el número de mensaje reservado (1, 2, 3...) — hace falta para poder
 * devolverlo — o el MOTIVO por el que no se reservó. Los dos motivos se
 * distinguen (`sin_cupo` vs `fallo_reserva`) porque terminan en una nota que lee
 * un asesor: antes ambos eran `null` y la nota afirmaba siempre "se agotó el
 * cupo", así que ante una RPC rota lo mandaba a mirar el tope de mensajes en
 * lugar del problema real. La CONDUCTA es la misma en los dos casos —
 * fail-closed, no se manda nada—; lo que cambia es lo que se cuenta.
 */
type ClaimResult = { ok: true; slot: number } | { ok: false; reason: ClaimFailure }

async function claimMessageSlot(
  sb: ReturnType<typeof admin>,
  phoneE164: string,
  max: number,
): Promise<ClaimResult> {
  try {
    const { data, error } = await sb.rpc('claim_agent_message_slot', { p_phone: phoneE164, p_max: max })
    if (error) {
      console.warn('[scheduling-agent] no se pudo reservar el cupo de mensajes — no se manda nada:', error.message)
      return { ok: false, reason: 'fallo_reserva' }
    }
    if (typeof data !== 'number') return { ok: false, reason: 'sin_cupo' }
    return { ok: true, slot: data }
  } catch (err) {
    console.warn('[scheduling-agent] excepción reservando el cupo de mensajes — no se manda nada:', err)
    return { ok: false, reason: 'fallo_reserva' }
  }
}

/**
 * Devuelve un cupo reservado. Se llama SOLO cuando `sendWhatsappText` respondió
 * `skipped`, o sea cuando NO salió absolutamente nada: modo prueba
 * (`WHATSAPP_TEST_MODE`) o credenciales de Meta ausentes.
 *
 * POR QUÉ EXISTE: la reserva va ANTES del envío (eso es lo que evita el mensaje
 * duplicado entre dos webhooks concurrentes, no se toca). Pero `skipped` no es
 * un envío fallido, es un envío que nunca ocurrió. Sin esta devolución, prender
 * `scheduling_enabled` con el modo prueba todavía activo —perfectamente posible
 * el día del estreno— quemaba los 3 cupos de cada conversación sin que el
 * cliente leyera una sola palabra, y después el agente quedaba mudo para
 * siempre creyendo que ya había hablado.
 *
 * Y POR QUÉ SOLO EN ESE CASO: ante un error REAL de Meta no sabemos si el
 * mensaje salió (puede haberse cortado la respuesta con el mensaje ya
 * aceptado), así que el cupo queda consumido — mandar de menos es el lado
 * barato del error, mandar dos veces lo mismo no.
 *
 * El "devolver" es un valor ABSOLUTO (`claimed - 1`) y no un decremento
 * atómico, y eso alcanza: `skipped` es una condición del PROCESO, no de este
 * mensaje — si un envío se saltea se saltean TODOS, así que no hay ningún cupo
 * legítimo de otro webhook que pisar. En el peor entrelazado quedaría un cupo
 * de más consumido, nunca de menos.
 */
async function releaseMessageSlot(phoneE164: string, claimed: number): Promise<void> {
  await updateAgentState(phoneE164, { agentMessagesSent: Math.max(0, claimed - 1) })
}

/**
 * Los DOS nombres, que no son el mismo (y confundirlos era el bug): el que se
 * usa para HABLARLE a una persona y el que va en la columna `client_name` de
 * `property_visits`.
 */
interface ClientNames {
  /**
   * Nombre REAL, o `null` si no lo sabemos. `null` es la señal de "saludá sin
   * nombre": el fallback `Cliente WhatsApp +54911...` pasaba por el helper que
   * toma el primer nombre y el cliente terminaba leyendo "¡Buenísimo, Cliente!
   * Anoté tu visita…". Ese fallback nunca fue un nombre de persona.
   */
  display: string | null
  /** Lo que se guarda en la visita. La columna es NOT NULL, así que acá sí hay fallback. */
  forVisit: string
}

async function resolveClientName(
  sb: ReturnType<typeof admin>,
  input: Pick<RunSchedulingAgentInput, 'contactName' | 'leadId' | 'phoneE164'>,
): Promise<ClientNames> {
  const fallback = `Cliente WhatsApp +${input.phoneE164}`
  const fromWa = input.contactName?.trim()
  if (fromWa) return { display: fromWa, forVisit: fromWa }
  if (input.leadId) {
    try {
      const { data } = await sb.from('property_leads').select('name').eq('id', input.leadId).maybeSingle()
      const name = (data as { name?: string | null } | null)?.name?.trim()
      if (name) return { display: name, forVisit: name }
    } catch {
      /* cae al fallback */
    }
  }
  return { display: null, forVisit: fallback }
}

/**
 * Entrypoint del webhook. Lee los DOS interruptores (fail-closed: si no se
 * pueden leer, no manda nada), decide con `decideSchedulingAction`, y
 * ejecuta. NUNCA lanza.
 */

/**
 * Los datos de la propiedad que el agente necesita para CONTESTAR preguntas.
 * Todo lo que no esté acá, el agente no lo sabe y no lo inventa.
 */
interface PropertyForAgent {
  address: string | null
  title: string | null
  assigned_to: string | null
  ai_scheduling_enabled: boolean
  neighborhood: string | null
  city: string | null
  property_type: string | null
  operation_type: string | null
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  covered_area: number | null
  total_area: number | null
  asking_price: number | null
  currency: string | null
  expenses: number | null
}

/**
 * La propiedad en líneas sueltas, como se las pasamos al modelo. Solo entra lo
 * que está CARGADO: un campo vacío no genera línea, así el agente nunca ve un
 * "Precio: null" que después pueda repetirle a un cliente.
 */
export function propertyFacts(p: PropertyForAgent): string[] {
  const out: string[] = []
  const num = (v: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  if (p.property_type) out.push(`Tipo: ${p.property_type}${p.operation_type ? ` en ${p.operation_type}` : ''}`)
  const zona = [p.neighborhood, p.city].filter(Boolean).join(', ')
  if (zona) out.push(`Zona: ${zona}`)
  const precio = num(p.asking_price)
  if (precio !== null) out.push(`Precio: ${p.currency === 'ARS' ? '$' : 'USD'} ${precio.toLocaleString('es-AR')}`)
  const exp = num(p.expenses)
  if (exp !== null) out.push(`Expensas: $ ${exp.toLocaleString('es-AR')}`)
  const amb = num(p.rooms)
  if (amb !== null) out.push(`${amb} ambientes`)
  const dorm = num(p.bedrooms)
  if (dorm !== null) out.push(`${dorm} dormitorios`)
  const banos = num(p.bathrooms)
  if (banos !== null) out.push(`${banos} baños`)
  const cub = num(p.covered_area)
  if (cub !== null) out.push(`Superficie cubierta: ${cub} m²`)
  const tot = num(p.total_area)
  if (tot !== null && tot !== cub) out.push(`Superficie total: ${tot} m²`)
  return out
}

export async function runSchedulingAgent(input: RunSchedulingAgentInput): Promise<RunSchedulingAgentResult> {
  try {
    if (!input.propertyId) {
      return { action: 'noop', reason: 'la conversación no tiene una propiedad asociada' }
    }

    const now = input.now ?? new Date()
    const sb = admin()

    const [settingsRes, propRes] = await Promise.all([
      sb.from('ai_agent_settings').select('scheduling_enabled, max_messages_per_conversation').eq('id', true).maybeSingle(),
      sb
        .from('properties')
        .select('address, title, assigned_to, ai_scheduling_enabled, neighborhood, city, property_type, operation_type, rooms, bedrooms, bathrooms, covered_area, total_area, asking_price, currency, expenses')
        .eq('id', input.propertyId)
        .maybeSingle(),
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
    const prop = propRes.data as PropertyForAgent | null
    if (propRes.error || !prop) {
      console.warn(
        '[scheduling-agent] no se pudo leer la propiedad — no se manda nada (fail-closed):',
        propRes.error?.message,
      )
      return { action: 'noop', reason: 'no se pudo confirmar el interruptor de la propiedad' }
    }

    // Este ciclo corre INMEDIATAMENTE después de persistir el mensaje
    // entrante que disparó el turno — la ventana, por construcción, acaba de
    // abrir. Se calcula explícito igual, para que el chequeo quede documentado.
    const windowOpen = serviceWindow(now.toISOString(), now).open
    const propertyLabel = prop.address ? `la propiedad de ${prop.address}` : prop.title || 'la propiedad'
    const todayISO = hoyEnArgentina(now)

    // Contadores del agente. Si no se pueden leer, no se escribe: sin ellos no
    // sabemos si esta conversación ya fue derivada a una persona ni cuántos
    // mensajes automáticos lleva.
    const readState = await getConversationAiState(input.phoneE164)
    if (readState.readFailed) {
      return { action: 'noop', reason: 'no se pudo leer el estado de la conversación' }
    }
    const agentMessagesSent = readState.state?.agent_messages_sent ?? 0
    const agentHandedOff = readState.state?.agent_handed_off ?? false

    // ¿Ya hay una visita viva? El modelo tiene que SABERLO antes de pensar: con
    // una visita coordinada no propone ni mueve nada, eso lo decide una persona.
    const enAgenda = await findExistingActiveVisit(sb, input.propertyId, input.phoneE164, now)
    if (enAgenda.readFailed) {
      // No poder leer NO habilita a escribir: un hipo de PostgREST se leía como
      // "no hay ninguna visita" y el agente creaba una duplicada.
      await logOutbound({
        phone: input.phoneE164,
        bodyPreview: buildVisitLookupFailedNote(enAgenda.error ?? 'error de lectura'),
        status: NOTE_STATUS_VISIT_LOOKUP_FAILED,
        leadId: input.leadId,
        propertyId: input.propertyId,
        sentBy: null,
        aiGenerated: true,
      })
      return { action: 'noop', reason: 'no se pudo verificar si ya había una visita en agenda' }
    }
    const pendiente = enAgenda.visit
    const clientName = await resolveClientName(sb, input)

    // Si CUALQUIER freno está puesto, el modelo igual analiza (el Inbox necesita
    // el resumen y la prioridad), pero se le dice que no redacte respuesta.
    const canWrite =
      settings.scheduling_enabled &&
      prop.ai_scheduling_enabled &&
      windowOpen &&
      !agentHandedOff &&
      agentMessagesSent < settings.max_messages_per_conversation &&
      !pendiente

    // ── LA ÚNICA LLAMADA AL MODELO DEL REQUEST ──────────────────────────────
    // Entiende la conversación Y redacta la respuesta. Ver `lib/ai/agent-brain.ts`.
    const analysis = await runConversationAnalysis(input.phoneE164, now, {
      clientName: clientName.display,
      propertyLabel,
      propertyFacts: propertyFacts(prop),
      todayISO,
      agentMessagesSent,
      maxMessages: settings.max_messages_per_conversation,
      hasActiveVisit: !!pendiente,
      canWrite,
    })
    if (!analysis.analyzed) {
      return { action: 'noop', reason: 'no hubo análisis nuevo en este turno' }
    }

    if (pendiente) {
      if (!(await yaHayNotaInterna(sb, input.phoneE164, input.propertyId, NOTE_STATUS_PENDING_VISIT, pendiente.desdeISO))) {
        await logOutbound({
          phone: input.phoneE164,
          bodyPreview: buildActiveVisitNote(pendiente.fecha, pendiente.status),
          status: NOTE_STATUS_PENDING_VISIT,
          leadId: input.leadId,
          propertyId: input.propertyId,
          sentBy: null,
          aiGenerated: true,
        })
      }
      return { action: 'noop', reason: 'ya hay una visita en agenda para esta propiedad; moverla la decide una persona' }
    }

    // El modelo PROPONE la fecha; el código la valida antes de que entre al CRM.
    // Una fecha inventada (o el 31 de febrero) no agenda nada: se manda igual
    // la respuesta, que en ese caso será una pregunta.
    const propuesta = validateProposedVisit(analysis.visitDate, analysis.visitHour, todayISO)
    if (analysis.visitDate && !propuesta.ok) {
      console.warn('[agente] el modelo propuso una fecha que no pasa la validación:', analysis.visitDate, propuesta.reason)
    }

    const decision = decideSchedulingAction({
      now,
      reply: analysis.reply,
      visit: propuesta.ok ? { dateISO: propuesta.dateISO, hour: propuesta.hour } : undefined,
      agentMessagesSent,
      agentHandedOff,
      maxMessagesPerConversation: settings.max_messages_per_conversation,
      schedulingEnabledGlobal: settings.scheduling_enabled,
      schedulingEnabledProperty: prop.ai_scheduling_enabled,
      windowOpen,
    })

    if (decision.type === 'noop') {
      return { action: 'noop', reason: decision.reason }
    }

    if (decision.type === 'handoff') {
      // Nota INTERNA — al cliente no se le avisa "ahora te atiende un humano"
      // en su propio chat; queda registrada para que el Inbox la muestre.
      await logOutbound({
        phone: input.phoneE164,
        bodyPreview: buildHandoffNote(settings.max_messages_per_conversation),
        status: NOTE_STATUS_HANDOFF,
        leadId: input.leadId,
        propertyId: input.propertyId,
        sentBy: null,
        aiGenerated: true,
      })
      await updateAgentState(input.phoneE164, { agentHandedOff: true })
      return { action: 'handoff', reason: decision.reason }
    }

    // ── Hay algo que contestar ──────────────────────────────────────────────
    // ORDEN NO NEGOCIABLE cuando además hay visita: guardar → avisar al equipo
    // → recién ahí escribirle al cliente. Al revés, si el guardado falla, el
    // cliente lee que quedó anotada, nadie recibe el mail y se presenta en la
    // propiedad sin que lo espere nadie.
    let visitId: string | null = null
    if (decision.visit) {
      const result = await upsertPendingVisit(sb, {
        propertyId: input.propertyId,
        advisorId: prop.assigned_to,
        clientName: clientName.forVisit,
        clientEmail: null,
        clientPhone: `+${input.phoneE164}`,
        scheduledAt: scheduledAtHora(decision.visit.dateISO, decision.visit.hour),
        notes: `Propuesta por el cliente vía WhatsApp (agente de IA, ${decision.visit.hour}hs).`,
        existingVisitId: null,
        createdByAi: true,
      })
      if (!result.ok) {
        console.warn('[agente] no se pudo crear la visita pending_confirmation:', result.error)
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
      visitId = result.visitId
      await notifyAndAdvancePipeline(result.visitId, input.leadId)
    }

    const claimed = await claimMessageSlot(sb, input.phoneE164, settings.max_messages_per_conversation)
    if (!claimed.ok) {
      // Callarse sin dejar rastro no es una opción: el cliente queda esperando.
      // La nota dice la causa REAL (sin cupo vs. reserva fallida) para no mandar
      // al asesor a mirar el tope cuando el problema está en la base.
      await logOutbound({
        phone: input.phoneE164,
        bodyPreview: visitId
          ? buildVisitUnconfirmedNote(dayWord(decision.visit!.dateISO, todayISO), `a las ${decision.visit!.hour}`, claimed.reason)
          : buildProposeUnsentNote(claimed.reason),
        status: visitId ? NOTE_STATUS_VISIT_UNCONFIRMED : NOTE_STATUS_PROPOSE_UNSENT,
        leadId: input.leadId,
        propertyId: input.propertyId,
        sentBy: null,
        aiGenerated: true,
      })
      return {
        action: 'noop',
        reason: visitId
          ? `la visita quedó registrada pero no se le confirmó al cliente: ${claimed.reason}`
          : `no se le pudo contestar: ${claimed.reason}`,
      }
    }

    const sent = await sendWhatsappText({
      to: input.phoneE164,
      text: decision.text,
      leadId: input.leadId,
      propertyId: input.propertyId,
      sentBy: null,
      aiGenerated: true,
    })
    // No salió nada (modo prueba / sin credenciales) ⇒ el cupo vuelve.
    if (sent.skipped) await releaseMessageSlot(input.phoneE164, claimed.slot)
    return { action: 'reply' }
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
