/**
 * El agente que atiende a quien pidió una TASACIÓN por la landing.
 *
 * Corre en el webhook de WhatsApp, en la rama de conversaciones SIN propiedad
 * asociada — que es justo donde caen estos leads y donde hasta ahora solo se
 * analizaba la bandeja sin contestarle a nadie. El agente de propiedades
 * (`scheduling-agent.ts`) no se toca: son dos guiones distintos que no comparten
 * ni estado ni interruptor.
 *
 * Qué hace: sigue el guion de `tasacion-flow.ts` (canal → cuándo → dónde), guarda
 * lo que la persona va diciendo en el trato y avisa al equipo. Qué NO hace: NO
 * agenda ni promete horarios (decisión del dueño, 2026-08-13) — cierra diciendo
 * que un asesor se contacta para confirmar la visita según su disponibilidad.
 *
 * Frenos, todos fail-closed (ante la duda NO escribe):
 *   - `ai_agent_settings.tasacion_enabled` tiene que estar en true.
 *   - Tiene que haber un trato de tasación ABIERTO para ese teléfono. Sin eso,
 *     esta conversación no es de tasación y el agente no opina.
 *   - Ventana de 24 h abierta (Meta rechaza texto libre fuera de ventana).
 *   - Conversación ya cerrada o derivada → no vuelve a escribir nunca.
 */
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsappText } from '@/lib/integrations/whatsapp/core'
import { siguienteTurno, resumenParaEquipo, type EstadoTasacion } from '@/lib/ai/tasacion-flow'

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

interface TratoDeTasacion {
  id: string
  contact_id: string | null
  estado: EstadoTasacion
}

/**
 * El trato de tasación abierto de ese teléfono, si lo hay. Busca por el contacto
 * dueño del número: el mismo camino por el que se creó el lead.
 */
async function buscarTrato(phoneE164: string): Promise<TratoDeTasacion | null> {
  const sb = admin()
  // El teléfono puede estar guardado con o sin '+' según por dónde entró.
  const variantes = [phoneE164, `+${phoneE164}`, phoneE164.replace(/^\+/, '')]
  const { data: contactos } = await sb
    .from('contacts')
    .select('id')
    .in('phone', variantes)
    .limit(5)
  const ids = (contactos ?? []).map((c) => (c as { id: string }).id)
  if (ids.length === 0) return null

  const { data: deals } = await sb
    .from('deals')
    .select('id, contact_id, stage, origin, tasacion_wa_state, created_at')
    .in('contact_id', ids)
    .eq('origin', 'embudo')
    .in('stage', ETAPAS_ABIERTAS)
    .order('created_at', { ascending: false })
    .limit(1)
  const d = (deals ?? [])[0] as
    | { id: string; contact_id: string | null; tasacion_wa_state: EstadoTasacion | null }
    | undefined
  if (!d) return null

  return {
    id: d.id,
    contact_id: d.contact_id,
    // Sin estado guardado, la conversación arranca donde la dejó la plantilla.
    estado: d.tasacion_wa_state ?? { paso: 'esperando_canal' },
  }
}

/** Deja los datos en el trato: el estado del guion y una nota legible. */
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
}

export type ResultadoAgenteTasacion =
  | { actuo: false; motivo: string }
  | { actuo: true; respondio: boolean; paso: EstadoTasacion['paso'] }

/**
 * Un turno del agente. Nunca lanza: un fallo acá no puede tumbar el 200 que el
 * webhook le debe a Meta.
 */
export async function runTasacionAgent(
  input: RunTasacionAgentInput,
): Promise<ResultadoAgenteTasacion> {
  try {
    if (!(await agenteHabilitado())) return { actuo: false, motivo: 'apagado' }

    const trato = await buscarTrato(input.phoneE164)
    if (!trato) return { actuo: false, motivo: 'sin trato de tasación abierto' }

    const turno = siguienteTurno(trato.estado, input.mensaje)
    if (!turno.respuesta) {
      return { actuo: false, motivo: `guion terminado (${trato.estado.paso})` }
    }

    // La ventana de 24 h NO se chequea acá y es correcto: este agente solo corre
    // como respuesta a un mensaje ENTRANTE del cliente, así que por construcción
    // la ventana se acaba de abrir con ese mismo mensaje. (Mismo criterio que el
    // agente de propiedades.)

    // Se GUARDA antes de escribir: si el envío falla, el estado ya avanzó y no
    // se le repite la misma pregunta a la persona en el próximo mensaje.
    const nota = turno.avisarEquipo ? resumenParaEquipo(turno.estado) : null
    await guardarEnTrato(trato.id, turno.estado, nota)

    const r = await sendWhatsappText({
      to: input.phoneE164,
      text: turno.respuesta,
      aiGenerated: true,
      origen: 'landing',
    })
    if (!r.ok && !r.skipped) {
      console.warn('[tasacion-agent] no se pudo enviar:', r.error)
    }

    // El aviso al equipo va DESPUÉS de escribirle al cliente: primero se atiende
    // a quien está esperando, después se ordena la casa.
    if (turno.avisarEquipo) {
      try {
        const { createTaskForRole } = await import('@/lib/supabase/tasks')
        const titulo =
          turno.motivo === 'pidio_llamada'
            ? `Llamar para coordinar tasación: ${input.contactName ?? input.phoneE164}`
            : turno.motivo === 'derivado'
              ? `Consulta por WhatsApp (tasación): ${input.contactName ?? input.phoneE164}`
              : `Confirmar tasación: ${input.contactName ?? input.phoneE164}`
        await createTaskForRole('coordinador', {
          type: 'update_contact',
          title: titulo,
          description: `${resumenParaEquipo(turno.estado)}\n\nTeléfono: ${input.phoneE164}`,
          deal_id: trato.id,
          contact_id: trato.contact_id ?? undefined,
        })
      } catch (e) {
        console.warn('[tasacion-agent] no se pudo crear la tarea del equipo', e)
      }
    }

    return { actuo: true, respondio: r.ok === true, paso: turno.estado.paso }
  } catch (err) {
    console.warn('[tasacion-agent] excepción (continuando):', err)
    return { actuo: false, motivo: 'excepción' }
  }
}
