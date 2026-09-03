/**
 * El agente que atiende a quien pidió una TASACIÓN por la landing.
 *
 * Junta dos datos —cuándo puede y dónde queda la propiedad— y se los deja al
 * equipo. NO agenda ni promete horarios (decisión del dueño, 2026-08-13):
 * cierra diciendo que un asesor se contacta para confirmar la visita.
 *
 * El prompt y la validación viven en `tasacion-brain.ts`. Acá está el
 * cableado: a quién le corresponde, de dónde sale el contexto, y qué pasa
 * después de que el modelo contesta.
 *
 * ## Por qué NO comparte nada con el agente de propiedades
 *
 * Son dos trabajos distintos: uno responde sobre una propiedad publicada, el
 * otro coordina una visita de tasación a la casa de la persona. Módulo propio,
 * estado propio (`deals.tasacion_wa_state`) e interruptor propio
 * (`ai_agent_settings.tasacion_enabled`). Prender uno no puede prender el otro.
 *
 * ## Una sola llamada al modelo
 *
 * Cuando el agente actúa, su llamada REEMPLAZA a la del análisis de bandeja
 * para esa conversación, no se suma a ella (regla dura del proyecto: nunca
 * encadenar dos llamadas de IA dentro de un request — ver CLAUDE.md). Por eso
 * el prompt devuelve también el resumen y la prioridad que ordenan el Inbox.
 * Cuando NO actúa, el webhook corre el análisis en su lugar — sigue siendo una
 * sola llamada. Quién puede gastarla lo dice `consumioModelo` en el resultado.
 *
 * ## Qué lo apaga
 *
 * Dos frenos, y el primero es el que importa: la PLANTILLA vigente. Si el
 * mensaje que la persona recibió no le pregunta nada, el agente no habla, y eso
 * no se puede desactivar desde ningún panel. Después sí, el interruptor propio
 * (`ai_agent_settings.tasacion_enabled`).
 *
 * Todos los frenos son fail-closed: si algo no se puede leer, no escribe.
 */
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { chatCompletion } from '@/lib/ai/chat-client'
import { sendWhatsappText } from '@/lib/integrations/whatsapp/core'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import {
  TASACION_AGENT_PROMPT,
  buildTasacionUserPrompt,
  coerceTasacionDecision,
  aplicarDecision,
  resumenParaEquipo,
  type EstadoTasacion,
} from '@/lib/ai/tasacion-brain'

/** Mismo techo que el análisis: el webhook le debe un 200 rápido a Meta. */
const TIMEOUT_MS = 12_000
const MAX_OUTPUT_TOKENS = 500
/** Tope de mensajes automáticos por conversación. Al llegar, sigue una persona. */
const MAX_MENSAJES = 6

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Etapas en las que un lead de tasación todavía espera que lo coordinen. */
const ETAPAS_ABIERTAS = ['request', 'scheduled', 'followup']

/**
 * Las plantillas que ABREN una conversación: le preguntan algo a la persona y
 * esperan que conteste. Solo con una de estas tiene sentido que el agente
 * atienda.
 *
 * POR QUÉ ESTO EXISTE (2026-09-02, pasó de verdad). El agente y la plantilla
 * son dos cosas que tienen que decir lo mismo, y vivían en dos lugares
 * distintos: la plantilla en una variable de Netlify, el agente en una columna
 * de Supabase. El 29/8 se cambió la plantilla a `tasacion_llamada_v1` ("te
 * llama Paula por teléfono") y el interruptor del agente quedó prendido. A
 * Eduardo le llegó "te llamará Paula", contestó "bueno gracias", y el bot le
 * pidió día, horario y dirección por chat — le prometimos dos caminos y
 * cumplimos ninguno.
 *
 * Estaba documentado que los dos pasos van juntos. No alcanzó: un documento no
 * frena nada. Así que ahora el agente NO tiene opinión propia sobre si
 * corresponde hablar — lo deduce de la plantilla que realmente está saliendo.
 * Cambiar la plantilla apaga el agente solo.
 *
 * Si mañana se crea otra plantilla que pregunte algo, hay que agregarla ACÁ
 * además de setear la variable. Mientras no esté, el agente calla y avisa por
 * consola: quedarse callado es el lado seguro del error.
 */
const PLANTILLAS_QUE_CONVERSAN = new Set(['tasacion_coordinar_util', 'tasacion_coordinar_v2'])

/** Las que solo AVISAN algo y no esperan respuesta. Listadas para no confundir "no conversa" con "no la conozco". */
const PLANTILLAS_QUE_SOLO_AVISAN = new Set(['tasacion_llamada_v1'])

export type ModoDeLaPlantilla = 'conversa' | 'solo_avisa' | 'sin_plantilla' | 'desconocida'

/**
 * En qué modo está el primer WhatsApp de tasación, según la plantilla vigente.
 * Pura: la decisión se toma con el nombre, sin tocar red ni base.
 */
export function modoDePlantilla(nombre: string | null | undefined): ModoDeLaPlantilla {
  if (!nombre) return 'sin_plantilla'
  if (PLANTILLAS_QUE_CONVERSAN.has(nombre)) return 'conversa'
  if (PLANTILLAS_QUE_SOLO_AVISAN.has(nombre)) return 'solo_avisa'
  return 'desconocida'
}

/**
 * ¿La plantilla que está saliendo invita a conversar? Fail-closed en los tres
 * casos que no son un sí explícito.
 */
function laPlantillaInvitaAConversar(): { ok: boolean; motivo: string } {
  const nombre = process.env.WHATSAPP_TEMPLATE_TASACION ?? null
  const modo = modoDePlantilla(nombre)
  if (modo === 'conversa') return { ok: true, motivo: '' }
  if (modo === 'desconocida') {
    // Ni conversa ni avisa: no la conocemos. Se calla igual, pero esto se tiene
    // que VER — si alguien estrenó una plantilla que pregunta y se olvidó de
    // sumarla arriba, el síntoma sería "el agente no contesta" sin ninguna pista.
    console.warn(
      `[tasacion-agent] la plantilla "${nombre}" no está en PLANTILLAS_QUE_CONVERSAN ` +
        'ni en PLANTILLAS_QUE_SOLO_AVISAN. El agente no contesta. Si esa plantilla ' +
        'pregunta algo, agregala a PLANTILLAS_QUE_CONVERSAN en lib/ai/tasacion-agent.ts.',
    )
    return { ok: false, motivo: `plantilla desconocida (${nombre})` }
  }
  return {
    ok: false,
    motivo: modo === 'sin_plantilla'
      ? 'no hay plantilla de tasación configurada'
      : `la plantilla vigente (${nombre}) avisa, no pregunta`,
  }
}

/** Interruptor propio. Fail-closed: si no se puede leer, NO escribe. */
async function agenteHabilitado(): Promise<boolean> {
  try {
    const { data, error } = await admin()
      .from('ai_agent_settings')
      .select('tasacion_enabled')
      .limit(1)
      .maybeSingle()
    if (error || !data) return false
    return (data as { tasacion_enabled?: boolean | null }).tasacion_enabled === true
  } catch {
    return false
  }
}

export interface TratoDeTasacion {
  id: string
  contactId: string | null
  contactName: string | null
  estado: EstadoTasacion
}

/**
 * El trato de tasación con guion ABIERTO de ese teléfono, si lo hay.
 *
 * Es también la función que decide, para el webhook, si una conversación
 * "es de tasación": exportada a propósito para que esa decisión se tome UNA
 * vez y en un solo lugar. Devuelve `null` si el guion ya terminó (datos
 * completos, pidió llamada o pasó a un humano) — a partir de ahí el agente no
 * vuelve a escribir nunca en esa conversación.
 */
export async function buscarTratoDeTasacion(phoneE164: string): Promise<TratoDeTasacion | null> {
  try {
    const sb = admin()
    // POR ÚLTIMOS 10 DÍGITOS, nunca por igualdad exacta. El mismo número vive
    // en la base como '+5491149372737', '+541149372737' y '1149372737' (el "9"
    // argentino), y la igualdad exacta dejó mudo al agente con un cliente real
    // (Daniel Lapadula, 2026-08-15): respondió a la plantilla y nadie lo
    // atendió. `phone_norm` es columna generada + índice (migración
    // 20260816000001): O(log n) a cualquier escala.
    const clave = ultimos10Digitos(phoneE164)
    if (!clave) return null
    const { data: contactos } = await sb.from('contacts').select('id, full_name').eq('phone_norm', clave).limit(10)
    const filas = (contactos ?? []) as Array<{ id: string; full_name: string | null }>
    if (filas.length === 0) return null

    const { data: deals } = await sb
      .from('deals')
      .select('id, contact_id, tasacion_wa_state, created_at')
      .in('contact_id', filas.map((c) => c.id))
      .eq('origin', 'embudo')
      .in('stage', ETAPAS_ABIERTAS)
      .not('tasacion_wa_state', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)

    const d = (deals ?? [])[0] as
      | { id: string; contact_id: string | null; tasacion_wa_state: EstadoTasacion | null }
      | undefined
    if (!d) return null

    const estado = d.tasacion_wa_state ?? {}
    // Guion terminado: esta conversación ya no es del agente.
    if (estado.cerrado === true || estado.derivado === true) return null

    return {
      id: d.id,
      contactId: d.contact_id,
      contactName: filas.find((c) => c.id === d.contact_id)?.full_name ?? null,
      estado,
    }
  } catch (err) {
    console.warn('[tasacion-agent] no se pudo buscar el trato (continuando):', err)
    return null
  }
}

/** Hoy en Argentina (YYYY-MM-DD). El modelo no sabe la fecha: se la damos. */
function hoyArgentinaISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

/** Deja el estado del guion y, si hay algo que contar, una nota en el trato. */
async function guardarEnTrato(dealId: string, estado: EstadoTasacion, nota: string | null): Promise<void> {
  const sb = admin()
  const patch: Record<string, unknown> = { tasacion_wa_state: estado }
  if (nota) {
    const { data } = await sb.from('deals').select('notes').eq('id', dealId).maybeSingle()
    const previas = ((data as { notes?: string | null } | null)?.notes ?? '').trim()
    patch.notes = previas ? `${previas}\n\n── WhatsApp ──\n${nota}` : `── WhatsApp ──\n${nota}`
  }
  await sb.from('deals').update(patch).eq('id', dealId)
}

export interface RunTasacionAgentInput {
  phoneE164: string
  /** Último mensaje entrante del cliente (texto plano). */
  mensaje: string
  contactName?: string | null
  /** El trato, si el caller ya lo buscó (el webhook lo hace para rutear). */
  trato?: TratoDeTasacion | null
}

/**
 * `consumioModelo` NO es telemetría: es lo que le dice al webhook si todavía le
 * queda permitida su única llamada al modelo.
 *
 * La regla dura del proyecto es una sola llamada de IA por request. Cuando el
 * agente no actúa, el webhook aprovecha para analizar la conversación y ordenar
 * el Inbox — pero hay un `actuo:false` que ocurre DESPUÉS de haberle preguntado
 * al modelo ("devolvió algo inservible"), y ahí analizar sería la segunda
 * llamada. Es obligatorio en la variante `false` justamente para que agregar un
 * `return` nuevo obligue a contestar la pregunta en vez de olvidarla.
 */
export type ResultadoAgenteTasacion =
  | { actuo: false; motivo: string; consumioModelo: boolean }
  | { actuo: true; respondio: boolean; cerrado: boolean }

/**
 * Un turno del agente. Nunca lanza: un fallo acá no puede tumbar el 200 que el
 * webhook le debe a Meta.
 */
export async function runTasacionAgent(input: RunTasacionAgentInput): Promise<ResultadoAgenteTasacion> {
  try {
    // El freno más barato primero: sin red ni base, solo el nombre de la
    // plantilla vigente. Y el más importante — es el que hace imposible que el
    // bot contradiga al mensaje que la persona acaba de recibir.
    const plantilla = laPlantillaInvitaAConversar()
    if (!plantilla.ok) return { actuo: false, motivo: plantilla.motivo, consumioModelo: false }

    if (!(await agenteHabilitado())) return { actuo: false, motivo: 'apagado', consumioModelo: false }

    const trato = input.trato ?? (await buscarTratoDeTasacion(input.phoneE164))
    if (!trato) return { actuo: false, motivo: 'sin trato de tasación con guion abierto', consumioModelo: false }

    const previo = trato.estado
    const enviados = previo.enviados ?? 0
    if (enviados >= MAX_MENSAJES) {
      // Se marca cerrado para que no vuelva a entrar nunca más por este camino.
      await guardarEnTrato(trato.id, { ...previo, cerrado: true }, null)
      return { actuo: false, motivo: 'tope de mensajes alcanzado', consumioModelo: false }
    }

    const texto = input.mensaje.trim()
    if (!texto) return { actuo: false, motivo: 'mensaje vacío', consumioModelo: false }

    // --- UNA llamada al modelo. Entiende y redacta en el mismo viaje.
    const res = await chatCompletion({
      messages: [
        { role: 'system', content: TASACION_AGENT_PROMPT },
        {
          role: 'user',
          content: buildTasacionUserPrompt({
            clientName: trato.contactName ?? input.contactName ?? null,
            todayISO: hoyArgentinaISO(),
            yaSabemos: {
              disponibilidad: previo.disponibilidad ?? null,
              direccion: previo.direccion ?? null,
              prefiereLlamada: previo.prefiereLlamada === true,
            },
            previousSummary: previo.resumen ?? '',
            newMessages: [{ from: 'cliente', text: texto }],
            ultimoMensajePropio: previo.ultimoMensaje ?? null,
            agentMessagesSent: enviados,
            maxMessages: MAX_MENSAJES,
          }),
        },
      ],
      temperature: 0.3,
      jsonMode: true,
      maxTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: TIMEOUT_MS,
    })

    const decision = coerceTasacionDecision(JSON.parse(res.content) as unknown)
    if (!decision) return { actuo: false, motivo: 'el modelo devolvió algo inservible', consumioModelo: true }

    // El CÓDIGO decide qué pasa con lo que el modelo entendió.
    const { estado, avisarEquipo, motivo } = aplicarDecision(previo, decision)

    // Se guarda ANTES de escribir: si el envío falla, el estado ya avanzó y no
    // se le repite la misma pregunta a la persona en el próximo mensaje.
    await guardarEnTrato(trato.id, estado, avisarEquipo ? resumenParaEquipo(estado) : null)

    let respondio = false
    if (decision.reply) {
      const r = await sendWhatsappText({
        to: input.phoneE164,
        text: decision.reply,
        aiGenerated: true,
        origen: 'landing',
      })
      respondio = r.ok === true
      if (!r.ok && !r.skipped) console.warn('[tasacion-agent] no se pudo enviar:', r.error)
    }

    // El aviso al equipo va DESPUÉS de contestarle a quien está esperando.
    if (avisarEquipo) {
      try {
        const { createTaskForRole } = await import('@/lib/supabase/tasks')
        const quien = trato.contactName ?? input.contactName ?? input.phoneE164
        const titulo =
          motivo === 'pidio_llamada'
            ? `Llamar para coordinar tasación: ${quien}`
            : motivo === 'derivado'
              ? `Consulta por WhatsApp (tasación): ${quien}`
              : `Coordinar tasación: ${quien}`
        await createTaskForRole('coordinador', {
          type: 'update_contact',
          title: titulo,
          description: [
            resumenParaEquipo(estado),
            decision.suggestedNextStep ? `\nSugerido: ${decision.suggestedNextStep}` : '',
            `\nTeléfono: ${input.phoneE164}`,
          ]
            .filter(Boolean)
            .join('\n'),
          deal_id: trato.id,
          contact_id: trato.contactId ?? undefined,
        })
      } catch (e) {
        console.warn('[tasacion-agent] no se pudo crear la tarea del equipo', e)
      }
    }

    return { actuo: true, respondio, cerrado: estado.cerrado === true }
  } catch (err) {
    console.warn('[tasacion-agent] excepción (continuando):', err)
    // `consumioModelo: true` aunque no sepamos dónde se rompió: desde acá no se
    // distingue una excepción anterior a la llamada de una posterior, y suponer
    // que no se llamó haría que el webhook pidiera OTRA. Perder un análisis de
    // bandeja es barato; encadenar dos llamadas de IA en un request es lo que la
    // regla dura del proyecto prohíbe.
    return { actuo: false, motivo: 'excepción', consumioModelo: true }
  }
}
