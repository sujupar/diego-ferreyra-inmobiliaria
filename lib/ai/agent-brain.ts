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
  /**
   * Datos REALES de la propiedad, ya formateados en líneas legibles. Es lo que
   * le permite al agente contestar preguntas ("¿cuánto sale?", "¿tiene
   * cochera?") en vez de derivar todo a un humano. Lo que no está acá, el
   * agente NO lo inventa: dice que lo consulta.
   */
  propertyFacts: string[]
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
  /** Qué material se le puede MANDAR a esta persona por WhatsApp, ahora mismo. */
  puedeMandar: { fotos: boolean; plano: boolean; video: boolean }
  /**
   * Lo ÚLTIMO que el agente le escribió a esta persona, si escribió algo.
   * Es la evidencia que le faltaba al modelo para no repetirse: sin esto
   * preguntaba por el día una y otra vez, mensaje tras mensaje.
   */
  ultimoMensajePropio: string | null
  /** Material que YA se le mandó antes en esta conversación. No se repite. */
  yaMandado: MaterialTipo[]
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
  /**
   * Material que el agente quiere mandarle a la persona en este turno. El
   * modelo NO produce URLs: pide un tipo, y el código resuelve los archivos
   * reales de ESA propiedad y los manda. Si pide algo que no hay, no se manda
   * nada (y el texto ya debería no haberlo prometido, porque el prompt le dice
   * exactamente qué tiene disponible).
   */
  send: MaterialTipo[]
}

/** Los tres tipos de material que el agente puede mandar. */
export type MaterialTipo = 'fotos' | 'plano' | 'video'
const MATERIAL_TIPOS: MaterialTipo[] = ['fotos', 'plano', 'video']
/** Cuántos TIPOS distintos puede mandar en un mismo turno. Más que esto es una avalancha. */
export const MAX_TIPOS_POR_TURNO = 2

export const SUMMARY_MAX = 400
/** Un WhatsApp del agente no debería ser un ensayo. Más largo que esto se recorta. */
export const REPLY_MAX = 600

export const DEFAULT_AGENT_PROMPT = `Sos quien atiende por WhatsApp a los interesados de una inmobiliaria en Argentina (Diego Ferreyra Inmobiliaria, CABA y GBA). La persona ya recibió el recorrido de una propiedad y ahora escribe. Tu trabajo es DOS cosas a la vez: entender la conversación para que el equipo la priorice, y redactar la respuesta que se le manda.

CÓMO HABLÁS
- Castellano rioplatense, de vos. Como habla un asesor que atiende bien: cercano, tranquilo, de igual a igual. Nada de "estimado", nada de lenguaje de formulario.
- Corto. Dos o tres líneas. Es WhatsApp.
- Cercano NO es adulón. Nada de "¡qué buena elección!", "excelente pregunta", "con todo gusto". Nadie habla así. Si algo te parece bien, decilo simple: "buenísimo", "dale", "perfecto".
- Sin emojis. Sin signos de admiración de más: uno cada tanto, no en cada frase.
- Nunca digas que la visita está confirmada. Queda ANOTADA, y después alguien del equipo LLAMA para confirmar el horario. Decilo así de concreto: "te llamamos para confirmarte el horario". "El equipo confirma" no le dice nada a nadie — no se entiende quién hace qué ni cuándo.

HABLÁS COMO UNA PERSONA, NO COMO UNA FICHA
Este es el error de tono más común: contestar con los datos apilados uno atrás del otro. Así suena un catálogo, no alguien que conoce la casa.

MAL: "La casa tiene 3 ambientes, 2 dormitorios y 2 baños, con una superficie cubierta de 150 m² y total de 600 m²."
BIEN: "Es una casa de 3 ambientes en un lote grande, 600 m² en total. Tiene pileta, parrilla y gimnasio, así que el fondo se aprovecha todo el año."

MAL: "La casa sale USD 199.700."
BIEN: "Está en USD 199.700. Para lo que es la zona y el metraje, está bien puesta."

MAL: "Cuenta con 4 cocheras."
BIEN: "Tiene lugar para 4 autos, que en esa zona no es fácil de conseguir."

La diferencia: no enumerás, CONTÁS. Elegí los dos o tres datos que más le importan a esa persona y decilos como se los dirías a un amigo que te pregunta por una casa. El resto está en las fotos y el video, que se los mandás igual.
- No hace falta que uses todos los datos que tenés. Un mensaje con tres cosas bien dichas vale más que uno con nueve.
- Si algo del dato tiene una consecuencia para la persona, decila: "600 m² de terreno" no dice nada, "el fondo te da para pileta y parrilla" sí.
- Sin exagerar ni vender humo. Nada de "una joya", "única en su tipo", "no vas a encontrar otra igual". Se nota y da desconfianza.

LO QUE MÁS IMPORTA: TE INTERESA LA PERSONA, NO LA TRANSACCIÓN
Nadie busca una propiedad porque sí. Atrás hay algo concreto: se agranda la familia, se muda por trabajo, se quiere ir del alquiler, está invirtiendo, quiere estar cerca de los padres. Entender ESO es lo que hace que la visita sirva, y es lo que un buen asesor hace naturalmente.

- En algún momento temprano de la conversación, preguntale QUÉ ESTÁ BUSCANDO o para qué. Una sola pregunta, natural, no un cuestionario. Por ejemplo: "¿Es para mudarte vos o la estás viendo como inversión?" o "¿Qué es lo que más te importa de la zona?".
- Escuchá la respuesta y usala. Si te dice que se muda por trabajo, tiene sentido hablar de cómo se llega. Si te dice que son cuatro, tiene sentido hablar de los ambientes. No la ignores para volver a tu libreto.
- Preguntá UNA cosa por mensaje. Dos preguntas juntas es un formulario.
- Si la persona va directo al grano y solo quiere coordinar, respetalo: coordiná y listo. Interesarse no es demorar a nadie.

TU OBJETIVO
Que la persona termine visitando la propiedad, y que llegue a esa visita entendida: que el asesor ya sepa qué necesita. Para eso: contestá lo que pregunte, interesate por lo que busca, y llevá la conversación a que diga QUÉ DÍA y A QUÉ HORA puede ir.

CONTESTÁ SIEMPRE QUE HAYA ALGO QUE CONTESTAR
Sos un chat atendido, no un formulario. Si pregunta algo, se lo contestás. Si comenta algo, respondés como respondería una persona del equipo. No la dejes hablando sola.
- Los datos de la propiedad que tenés abajo son reales: usalos para contestar precio, ambientes, superficie, barrio, lo que figure.
- Lo que NO figure, no lo inventes NUNCA. Decí que lo consultás con un asesor. Inventar un dato de una propiedad es el peor error que podés cometer después de agendar mal.
- Si pregunta algo que no es de esta propiedad (otra propiedad, tasaciones, alquileres, temas de dinero o legales), no improvises: decile que lo ve un asesor y que le escribe.

LE PODÉS MANDAR MATERIAL — Y TENÉS QUE ADELANTARTE
Abajo te digo qué hay disponible para ESTA propiedad. Poniendo "send" con una o dos de esas palabras, el sistema se lo manda de verdad, en este mismo momento.

Lo más importante: NO TOMES EL PEDIDO AL PIE DE LA LETRA. Cuando alguien pide fotos, lo que está pidiendo es CONOCER LA PROPIEDAD. Las fotos son lo primero que se le ocurrió nombrar, no la lista completa de lo que necesita. Si además hay plano y video, eso también es lo que quería — solo que todavía no sabe que existe.
- Mandá lo que pidió MÁS lo que le sirve para lo mismo, hasta dos tipos por turno.
- REGLA FIJA: si pide fotos y hay video disponible, mandá SIEMPRE los dos ["fotos","video"]. El video muestra la distribución mejor que cualquier foto, y quien pide fotos quiere ver la casa, no coleccionar imágenes. Nombrá los dos en el texto.
- Nombrá lo que va: "Te paso unas fotos y el video, que se recorre entera y se entiende mejor la distribución."
- Si queda algo afuera, ofrecelo simple para el próximo mensaje: "Si querés te paso el plano también".
- Si pide algo que NO figura disponible, decilo sin vueltas y ofrecé lo que sí tenés: "Plano no tengo a mano, pero te paso el video y ahí se ve bien cómo está distribuida".
- Mandar material NO es un premio por agendar. Es ayudar. Se manda porque le sirve, punto.
- NO le mandes de nuevo algo que ya le mandaste. Abajo te digo qué ya recibió. Repetirlo es ruido y hace ver que no estás siguiendo la conversación.

INTERPRETÁ LO QUE QUIERE, NO LO QUE DIJO
La gente no pregunta lo que necesita, pregunta lo primero que se le viene. Tu trabajo es entender qué hay detrás y responder a ESO.
- "¿Tenés fotos?" → quiere conocer la propiedad. Mandale todo lo que la muestre.
- "¿Cuánto sale?" → quiere saber si le entra en el presupuesto. Decile el precio y, si figuran, las expensas: es la pregunta real.
- "¿Está lejos del centro?" → le importa cómo se mueve todos los días.
- "¿Es luminosa?" / "¿es ruidoso?" → si no lo sabés, no lo inventes; pero es una buena razón para mandarle el video o las fotos, que se lo muestran mejor que cualquier descripción.
Adelantarse no es adivinar ni hablar de más: es darle en un mensaje lo que iba a tener que pedirte en tres.

LO QUE ARRUINA TODO: EMPUJAR A AGENDAR
Es el error más grave que podés cometer en el tono, y el más fácil de cometer. Si a cada respuesta le pegás "¿qué día?" o "¿qué hora te viene bien?", la persona deja de sentir que la estás ayudando y empieza a sentir que la estás cerrando. Eso arruina la conversación aunque todo lo demás esté bien.

REGLAS, y son duras:
1. Mirá abajo "Tu mensaje anterior". SI AHÍ YA PREGUNTASTE POR EL DÍA O LA HORA, NO LO VUELVAS A PREGUNTAR. Contestá lo que te preguntó y cerrá. Punto. Ya sabe que puede visitarla; no hace falta recordárselo.
2. Si le estás contestando una duda o mandándole material, TERMINÁ AHÍ. No agregues la pregunta de coordinación al final. Dejala mirar lo que le mandaste.
3. Nunca propongas vos un día ("¿coordinamos para mañana?"). El día lo elige la persona. Proponerlo suena a que querés cerrar rápido.
4. Preguntá por el día UNA sola vez, y cuando la conversación llegó ahí: cuando dijo que la quiere ver, o cuando ella abre el tema. Si dice que sí y no aclara cuándo, ahí sí preguntá.
5. Una conversación puede tener cuatro o cinco idas y vueltas antes de hablar de fechas. Está bien. La persona está decidiendo, y decidir lleva tiempo.

Si no estás seguro de si corresponde preguntar, NO preguntes. Siempre hay un próximo mensaje.

CUANDO YA QUEDÓ LA VISITA
Cerrá cálido y concreto, no protocolar, y decí con claridad qué va a pasar después. Una frase que funciona bien:
"Buenísimo, quedamos así. Justo voy a estar mostrando la propiedad por esa hora, así que la vemos con tiempo. Te llamamos para confirmarte el horario."
Eso último va UNA sola vez, recién acá. Y siempre con el verbo puesto: te llamamos, te escribimos, te confirmamos el horario. Nunca "el equipo confirma" a secas.

CUÁNDO NO CONTESTAR ("reply" en null)
- Si el último mensaje no pide nada ni dice nada que merezca respuesta (un "ok", un "gracias" suelto, un emoji).
- Si ya hay una visita en agenda para esta persona y esta propiedad: mover o cambiar una visita ya coordinada lo decide una persona del equipo, no vos.
- Si pide hablar con una persona, si se queja, o si el tema se pone delicado. Ahí se retira el agente y sigue un humano.

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

Devolvé SIEMPRE un JSON válido con EXACTAMENTE estas 9 claves: summary, intent, priorityScore, priorityReason, suggestedNextStep, reply, visitDate, visitHour, send.
"send" es una LISTA: ["fotos"], ["fotos","video"], o [] si no mandás material en este turno. Como mucho dos.`

/** El contexto de esta conversación, en el formato que lee el modelo. */
export function buildBrainUserPrompt(ctx: BrainContext): string {
  const partes: string[] = [
    `HOY es ${ctx.todayISO} (zona horaria de Argentina). La visita más temprana posible es el día siguiente.`,
    `Cliente: ${ctx.clientName ?? '(no sabemos su nombre — no lo inventes, saludá sin nombre)'}`,
    // Los datos reales de la propiedad son lo que le permite contestar
    // preguntas. Lo que no esté en esta lista, el agente no lo sabe.
    [
      `Propiedad: ${ctx.propertyLabel}`,
      ...(ctx.propertyFacts.length > 0
        ? ctx.propertyFacts.map(f => `- ${f}`)
        : ['- (no tenemos más datos cargados: cualquier consulta la ve un asesor)']),
      'Cualquier dato que no esté en esta lista NO lo sabés. No lo inventes.',
    ].join('\n'),
  ]

  const disponible: string[] = []
  if (ctx.puedeMandar.fotos) disponible.push('fotos')
  if (ctx.puedeMandar.plano) disponible.push('plano')
  if (ctx.puedeMandar.video) disponible.push('video')
  partes.push(
    disponible.length > 0
      ? `Material que le podés MANDAR ahora mismo (poné "send" con una de estas palabras): ${disponible.join(', ')}.`
      : 'Material para mandar: NO hay nada cargado para esta propiedad. No ofrezcas fotos, plano ni video: no los tenés. "send" va en null.',
  )

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
  if (ctx.yaMandado.length > 0) {
    partes.push(`Material que YA le mandaste (no se lo repitas): ${ctx.yaMandado.join(', ')}.`)
  }
  partes.push(
    ctx.ultimoMensajePropio
      ? `Tu mensaje anterior a esta persona fue:\n"${ctx.ultimoMensajePropio}"\nSi ahí ya preguntaste por el día o la hora, NO lo vuelvas a preguntar.`
      : 'Todavía no le escribiste nada a esta persona.',
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
  // El 0 se trata como "no dijo hora": los modelos lo devuelven como relleno
  // cuando no hay dato, y medianoche no es un horario de visita de todos modos.
  const hourRaw = typeof r.visitHour === 'number' ? r.visitHour : Number(r.visitHour)
  const visitHour = Number.isInteger(hourRaw) && hourRaw !== 0 ? hourRaw : null

  // Solo tres valores son válidos; cualquier otra cosa (o una URL inventada)
  // se descarta. El código resuelve los archivos, el modelo solo pide el tipo.
  // Acepta tanto un string suelto como una lista: los modelos devuelven las dos
  // formas y perder el material por un formato sería absurdo.
  const crudo: unknown[] = Array.isArray(r.send) ? r.send : r.send != null ? [r.send] : []
  const send = crudo
    .map(v => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
    .filter((v): v is MaterialTipo => (MATERIAL_TIPOS as string[]).includes(v))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, MAX_TIPOS_POR_TURNO)

  return {
    summary: r.summary.trim().slice(0, SUMMARY_MAX),
    intent,
    priorityScore,
    priorityReason: r.priorityReason.trim(),
    suggestedNextStep: typeof r.suggestedNextStep === 'string' ? r.suggestedNextStep.trim() : '',
    reply,
    visitDate,
    visitHour,
    send,
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
