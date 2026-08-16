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
 * Esta llamada REEMPLAZA a la del análisis de bandeja para estas
 * conversaciones, no se suma a ella (regla dura del proyecto: nunca encadenar
 * dos llamadas de IA dentro de un request — ver CLAUDE.md). Por eso el prompt
 * devuelve también el resumen y la prioridad que ordenan el Inbox.
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

export type ResultadoAgenteTasacion =
  | { actuo: false; motivo: string }
  | { actuo: true; respondio: boolean; cerrado: boolean }

/**
 * Un turno del agente. Nunca lanza: un fallo acá no puede tumbar el 200 que el
 * webhook le debe a Meta.
 */
export async function runTasacionAgent(input: RunTasacionAgentInput): Promise<ResultadoAgenteTasacion> {
  try {
    if (!(await agenteHabilitado())) return { actuo: false, motivo: 'apagado' }

    const trato = input.trato ?? (await buscarTratoDeTasacion(input.phoneE164))
    if (!trato) return { actuo: false, motivo: 'sin trato de tasación con guion abierto' }

    const previo = trato.estado
    const enviados = previo.enviados ?? 0
    if (enviados >= MAX_MENSAJES) {
      // Se marca cerrado para que no vuelva a entrar nunca más por este camino.
      await guardarEnTrato(trato.id, { ...previo, cerrado: true }, null)
      return { actuo: false, motivo: 'tope de mensajes alcanzado' }
    }

    const texto = input.mensaje.trim()
    if (!texto) return { actuo: false, motivo: 'mensaje vacío' }

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
    if (!decision) return { actuo: false, motivo: 'el modelo devolvió algo inservible' }

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
    return { actuo: false, motivo: 'excepción' }
  }
}
