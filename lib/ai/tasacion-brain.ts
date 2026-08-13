/**
 * EL PROMPT DEL AGENTE DE TASACIÓN — acá se decide qué contesta.
 *
 * ## Por qué esto reemplaza al guion de reglas (2026-08-13)
 *
 * La primera versión era una máquina de estados con expresiones regulares: para
 * pasar de un paso al siguiente, el mensaje de la persona tenía que parecerse a
 * lo que el regex esperaba. Es EXACTAMENTE el error que este proyecto ya había
 * cometido y documentado con el agente de propiedades tres meses antes: alguien
 * contesta "Mañana podría tipo 10" y el sistema no sabe qué hacer.
 *
 * Ahora el modelo entiende Y redacta, en UNA sola llamada. Sigue sin romperse la
 * regla dura del proyecto (nunca encadenar dos llamadas de IA en un request):
 * esta llamada REEMPLAZA a la del análisis de bandeja para estas conversaciones,
 * no se suma. Por eso el JSON devuelve también los campos que ordenan el Inbox.
 *
 * ## La división que hace que esto sea seguro
 *
 * **El modelo decide qué DECIR. El código decide qué PASA.** El modelo nunca
 * cierra el caso ni crea la tarea del equipo: reporta qué entendió. El código
 * verifica que estén los dos datos —cuándo puede y dónde queda la propiedad—
 * antes de dar por cerrado nada, y los frenos (interruptor, tope, conversación
 * ya derivada) se evalúan en código y MANDAN sobre lo que devuelva el modelo.
 *
 * ## Qué NO hace, por decisión del dueño
 *
 * No agenda ni promete horarios. Junta la disponibilidad y la dirección, y
 * cierra diciendo que un asesor se contacta para confirmar. La frase de cierre
 * es textual del dueño y está escrita UNA sola vez, abajo.
 */

/** Lo que el agente sabe cuando piensa la respuesta. */
export interface TasacionBrainContext {
  /** Nombre de pila, o null si no lo sabemos. */
  clientName: string | null
  /** Fecha de HOY en Argentina (YYYY-MM-DD). El modelo no la sabe: se la damos. */
  todayISO: string
  /** Lo que ya se capturó en turnos anteriores. */
  yaSabemos: { disponibilidad: string | null; direccion: string | null; prefiereLlamada: boolean }
  /** Resumen acumulado de la conversación (≤400 chars). */
  previousSummary: string
  /** Mensajes nuevos que la persona realmente vio. */
  newMessages: Array<{ from: 'cliente' | 'nosotros'; text: string }>
  /** Lo último que el agente le escribió. Sin esto se repite la misma pregunta. */
  ultimoMensajePropio: string | null
  /** Cuántos mensajes automáticos ya se mandaron en esta conversación. */
  agentMessagesSent: number
  /** Tope configurado. Al llegar, deja de escribir. */
  maxMessages: number
}

/** Lo que devuelve el modelo, ya validado. */
export interface TasacionDecision {
  /** Texto EXACTO a mandar, o null si no corresponde contestar. */
  reply: string | null
  /** Cuándo puede, tal como se entiende de lo que dijo ("el jueves a la tarde"). */
  disponibilidad: string | null
  /** Dónde queda la propiedad ("Av. Cabildo 2200, Belgrano"). */
  direccion: string | null
  /** Pidió que la llamen por teléfono en vez de coordinar por chat. */
  prefiereLlamada: boolean
  /** Se salió del guion (pregunta que no corresponde contestar, queja, baja). */
  derivar: boolean
  /** Para el Inbox del equipo. */
  summary: string
  priorityScore: number
  priorityReason: string
  suggestedNextStep: string
}

export const SUMMARY_MAX = 400
export const REPLY_MAX = 600

/** La frase de cierre, textual del dueño. Está acá UNA vez y se usa en los dos lados. */
export const CIERRE_TEXTUAL =
  'Dale, excelente. Te va a estar contactando el asesor para confirmar la visita ' +
  'para hacer la tasación, teniendo en cuenta tu disponibilidad. ¡Gracias!'

export const TASACION_AGENT_PROMPT = `Sos quien atiende por WhatsApp a las personas que pidieron una TASACIÓN de su propiedad en la web de una inmobiliaria en Argentina (Diego Ferreyra Inmobiliaria, CABA y GBA). La persona acaba de dejar sus datos en la web y ya recibió un primer mensaje preguntándole cómo prefiere coordinar. Ahora contesta.

TU ÚNICO TRABAJO
Conseguir DOS datos, en este orden, para que un asesor pueda ir a tasar:
  1) CUÁNDO puede — qué días y horarios le quedan bien.
  2) DÓNDE queda la propiedad — dirección y barrio.
Cuando tenés los dos, cerrás. Nada más. No es una conversación de venta.

CÓMO HABLÁS
- Castellano rioplatense, de vos. Como habla un asesor que atiende bien: cercano, tranquilo, de igual a igual. Nada de "estimado", nada de lenguaje de formulario.
- Corto. Una o dos líneas. Es WhatsApp.
- Cercano NO es adulón. Nada de "¡excelente elección!", "con todo gusto", "qué bueno que nos escribís". Si algo está bien, decilo simple: "dale", "perfecto", "buenísimo".
- Sin emojis. Un signo de admiración cada tanto, no en cada frase.
- Preguntá UNA cosa por mensaje. Dos preguntas juntas es un formulario.

ENTENDÉ LO QUE QUISO DECIR, NO LA FORMA EN QUE LO DIJO
Esto es lo más importante de todo. La gente contesta como habla, no como un formulario:

  "Mañana podría tipo 10"        → disponibilidad: "mañana a las 10"
  "el jueves a la tarde"          → disponibilidad: "el jueves a la tarde"
  "cualquier día después de las 6"→ disponibilidad: "cualquier día después de las 18"
  "y... entre semana"             → disponibilidad: "entre semana"
  "de lunes a viernes salvo el miércoles" → disponibilidad: eso mismo
  "cuando puedas"                 → NO es disponibilidad. Repreguntá con opciones concretas.
  "sí" / "dale" / "ok"            → NO es disponibilidad. Todavía no dijo cuándo.

Con la dirección, igual:
  "Cabildo 2200"                  → dirección: "Cabildo 2200"
  "es en Belgrano, sobre Cabildo al 2200" → dirección: "Cabildo 2200, Belgrano"
  "en Belgrano"                   → es SOLO el barrio. Pedí la calle y la altura.

NO te trabes esperando una forma exacta. Si de lo que dijo se entiende cuándo puede, ESO es la disponibilidad, aunque esté dicho de una manera rara. Si de verdad no se entiende, volvé a preguntar de otro modo, con un ejemplo concreto ("¿te sirve algún día de esta semana a la mañana?"), no repitiendo la misma frase.

QUÉ PREGUNTÁS SEGÚN LO QUE YA TENÉS
Abajo te digo qué datos ya están. La regla:
- No tenés NINGUNO → preguntá por la disponibilidad: "Perfecto, ¿qué días y horarios tenés disponibles así le paso al asesor que va a hacer la tasación?"
- Tenés la disponibilidad y falta la dirección → pedí la dirección: "Buenísimo. ¿Cuál es la dirección y el barrio de la propiedad?"
- Tenés los DOS → cerrás con la frase de cierre exacta de abajo.
- NUNCA vuelvas a pedir un dato que ya figura abajo como que lo tenés. Mirá también "Tu mensaje anterior": si ya preguntaste eso, no lo repitas igual.

SI PREFIERE QUE LA LLAMEN
Si dice que prefiere una llamada (o toca ese botón), poné "prefiereLlamada" en true y contestale que un asesor se comunica con ella para coordinar la tasación, poniéndote a disposición por si necesita algo más. Ahí termina tu trabajo: no le pidas la dirección ni el horario por chat. Ejemplo de tono:

  "Entendido, {nombre}. Un asesor se va a comunicar con vos para coordinar la tasación. Si necesitás algo más, decime."

CUANDO YA TENÉS CUÁNDO Y DÓNDE
Cerrás con esta frase, TEXTUAL, sin cambiarle nada y sin agregar preguntas después:

  "${CIERRE_TEXTUAL}"

Nunca digas que la visita quedó agendada, ni que "queda confirmada para el jueves". Vos no la cerrás: la confirma el asesor teniendo en cuenta lo que ella dijo. Prometer un horario que después el asesor no puede es lo peor que podés hacer acá.

CUÁNDO DERIVÁS A UNA PERSONA ("derivar" en true)
Poné "derivar" en true y escribí una respuesta corta diciendo que un asesor le responde, cuando:
- Pregunta algo que vos no podés contestar: cuánto cobran, cuánto vale su propiedad, comisiones, honorarios, plazos, temas legales o impositivos.
- Se queja, desconfía, o pide hablar con una persona.
- Dice que ya no le interesa, que se equivocó, o pide que no le escriban más.
NO inventes NUNCA un precio, una comisión ni una valuación. No sabés cuánto vale la propiedad: para eso justamente va el asesor.
Después de derivar, la conversación es de un humano. No sigas vos.

CUÁNDO NO CONTESTAR ("reply" en null)
Solo si el último mensaje no dice ni pide nada (un "ok" suelto, un "gracias", un emoji) y no falta ningún dato por pedir. Fuera de eso, contestá: sos un chat atendido, no un formulario.

SIEMPRE A DISPOSICIÓN
Aunque tu objetivo sean esos dos datos, si la persona pregunta algo razonable que podés contestar (por ejemplo si la tasación tiene costo: no, es sin costo y sin compromiso; o si es presencial: sí, el asesor va a la propiedad), contestáselo con naturalidad y seguí. No la dejes hablando sola ni le contestes con la misma pregunta de siempre.

LOS OTROS CAMPOS (son para el equipo, no para el cliente)
- "disponibilidad": lo que entendiste sobre cuándo puede, en tus palabras y corto ("el jueves a la tarde"). null si todavía no lo dijo. Si ya figuraba abajo y no lo cambió, repetí el que ya estaba.
- "direccion": la dirección con el barrio si lo dijo. null si todavía no la dio. Misma regla que arriba.
- "summary": reescribí el resumen COMPLETO desde cero, incorporando lo previo más lo nuevo. Máximo 400 caracteres. El próximo turno va a leer ESTE resumen y no los mensajes.
- "priorityScore": entero de 0 a 100, qué tan urgente es que un humano intervenga. Si derivás, alto.
- "priorityReason": una frase corta que un asesor entienda de un vistazo.
- "suggestedNextStep": la acción concreta para el asesor, con los datos que tengas ("Llamar para coordinar tasación en Cabildo 2200, disponible jueves a la tarde").

Devolvé SIEMPRE un JSON válido con EXACTAMENTE estas 9 claves: reply, disponibilidad, direccion, prefiereLlamada, derivar, summary, priorityScore, priorityReason, suggestedNextStep.`

/** El contexto de esta conversación, en el formato que lee el modelo. */
export function buildTasacionUserPrompt(ctx: TasacionBrainContext): string {
  const partes: string[] = [
    `HOY es ${ctx.todayISO} (zona horaria de Argentina).`,
    `Persona: ${ctx.clientName ?? '(no sabemos su nombre — no lo inventes, saludá sin nombre)'}`,
  ]

  // El estado en POSITIVO y explícito. Una lista de lo que falta es fácil de
  // desoír; "ya lo tenés, no lo vuelvas a pedir" no.
  const s = ctx.yaSabemos
  partes.push(
    [
      'DATOS QUE YA TENÉS DE ESTA PERSONA:',
      s.disponibilidad
        ? `- Cuándo puede: "${s.disponibilidad}". YA LO TENÉS. No se lo vuelvas a preguntar.`
        : '- Cuándo puede: todavía no lo dijo.',
      s.direccion
        ? `- Dirección de la propiedad: "${s.direccion}". YA LA TENÉS. No se la vuelvas a preguntar.`
        : '- Dirección de la propiedad: todavía no la dio.',
      s.prefiereLlamada
        ? '- Pidió que la LLAMEN por teléfono. No le pidas más datos por chat.'
        : '',
      s.disponibilidad && s.direccion
        ? 'TENÉS LOS DOS DATOS: corresponde cerrar con la frase de cierre textual.'
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )

  if (ctx.agentMessagesSent >= ctx.maxMessages) {
    partes.push(
      `ATENCIÓN: ya se mandaron ${ctx.agentMessagesSent} mensajes automáticos (el tope es ${ctx.maxMessages}). "reply" va en null: sigue una persona.`,
    )
  }

  partes.push(
    `Resumen previo:\n${ctx.previousSummary.trim() || '(sin resumen previo — es el primer mensaje que contesta)'}`,
  )
  partes.push(
    ctx.ultimoMensajePropio
      ? `Tu mensaje anterior a esta persona fue:\n"${ctx.ultimoMensajePropio}"\nNo repitas la misma pregunta: si no te contestó lo que pediste, volvé a pedirlo de OTRA manera, con un ejemplo concreto.`
      : 'Todavía no le escribiste nada por tu cuenta (solo recibió el mensaje inicial preguntándole cómo prefiere coordinar).',
  )
  partes.push(
    `Mensajes nuevos (${ctx.newMessages.length}):\n` +
      (ctx.newMessages.length > 0
        ? ctx.newMessages.map((m) => `[${m.from === 'cliente' ? 'Cliente' : 'Nosotros'}] ${m.text}`).join('\n')
        : '(ninguno)'),
  )
  return partes.join('\n\n')
}

/** Un texto que el modelo devolvió como dato capturado, o null si no sirve. */
function textoCapturado(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t.length === 0) return null
  // Los modelos devuelven estas cadenas como relleno cuando no hay dato.
  if (/^(null|none|n\/a|no dijo|no lo dijo|desconocid[oa]|sin dato)$/i.test(t)) return null
  return t.slice(0, 200)
}

/**
 * Valida la respuesta cruda del modelo. Devuelve `null` si le falta lo mínimo:
 * mejor no contestar que contestar cualquier cosa.
 */
export function coerceTasacionDecision(raw: unknown): TasacionDecision | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.summary !== 'string') return null

  const replyRaw = typeof r.reply === 'string' ? r.reply.trim() : ''
  const scoreRaw = typeof r.priorityScore === 'number' ? r.priorityScore : Number(r.priorityScore)

  return {
    reply: replyRaw.length > 0 ? replyRaw.slice(0, REPLY_MAX) : null,
    disponibilidad: textoCapturado(r.disponibilidad),
    direccion: textoCapturado(r.direccion),
    prefiereLlamada: r.prefiereLlamada === true,
    derivar: r.derivar === true,
    summary: r.summary.trim().slice(0, SUMMARY_MAX),
    priorityScore: Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : 0,
    priorityReason: typeof r.priorityReason === 'string' ? r.priorityReason.trim() : '',
    suggestedNextStep: typeof r.suggestedNextStep === 'string' ? r.suggestedNextStep.trim() : '',
  }
}

/** El estado del guion que se guarda en el trato entre un mensaje y el siguiente. */
export interface EstadoTasacion {
  disponibilidad?: string | null
  direccion?: string | null
  prefiereLlamada?: boolean
  /** Terminado: se juntaron los datos, pidió llamada, o pasó a un humano. */
  cerrado?: boolean
  derivado?: boolean
  /** Resumen acumulado para el próximo turno. */
  resumen?: string
  /** Lo último que escribió el agente, para no repetirse. */
  ultimoMensaje?: string | null
  /** Cuántos mensajes automáticos lleva esta conversación. */
  enviados?: number
}

/**
 * Aplica la decisión del modelo al estado. **Función pura**: es acá donde el
 * CÓDIGO decide qué pasa, no el modelo.
 *
 * El caso cerrado exige los DOS datos. El modelo puede escribir la frase de
 * cierre antes de tiempo; si lo hace, igual no se cierra el caso ni se avisa al
 * equipo hasta que estén cuándo y dónde.
 */
export function aplicarDecision(
  previo: EstadoTasacion,
  d: TasacionDecision,
): { estado: EstadoTasacion; avisarEquipo: boolean; motivo: 'datos_completos' | 'pidio_llamada' | 'derivado' | null } {
  const estado: EstadoTasacion = {
    ...previo,
    // Un dato ya capturado no se pierde porque el modelo lo omita en un turno.
    disponibilidad: d.disponibilidad ?? previo.disponibilidad ?? null,
    direccion: d.direccion ?? previo.direccion ?? null,
    prefiereLlamada: d.prefiereLlamada || previo.prefiereLlamada === true,
    resumen: d.summary || previo.resumen,
    ultimoMensaje: d.reply ?? previo.ultimoMensaje ?? null,
    enviados: (previo.enviados ?? 0) + (d.reply ? 1 : 0),
  }

  if (d.derivar) {
    estado.derivado = true
    estado.cerrado = true
    return { estado, avisarEquipo: true, motivo: 'derivado' }
  }
  if (estado.prefiereLlamada) {
    estado.cerrado = true
    return { estado, avisarEquipo: true, motivo: 'pidio_llamada' }
  }
  if (estado.disponibilidad && estado.direccion) {
    estado.cerrado = true
    return { estado, avisarEquipo: true, motivo: 'datos_completos' }
  }
  return { estado, avisarEquipo: false, motivo: null }
}

/** Lo que lee el asesor en la tarea. */
export function resumenParaEquipo(e: EstadoTasacion): string {
  if (e.derivado) return 'La persona preguntó algo que el agente no contesta. Requiere que la atienda un asesor.'
  if (e.prefiereLlamada) return 'Prefiere que la llamen por teléfono para coordinar la tasación.'
  const l: string[] = []
  l.push(e.disponibilidad ? `Disponibilidad: ${e.disponibilidad}` : 'Disponibilidad: no la dijo')
  l.push(e.direccion ? `Propiedad: ${e.direccion}` : 'Propiedad: no dio la dirección')
  return l.join('\n')
}
