/**
 * Núcleo compartido de "crear/actualizar una visita PROPUESTA (pending_confirmation)".
 *
 * Extraído de `app/api/v/[token]/schedule/route.ts` (task 3, 2026-08-03) para que
 * el agente de IA que agenda (`lib/ai/scheduling-agent.ts`) reuse EXACTAMENTE el
 * mismo camino — nunca hay dos formas de crear una visita propuesta en el
 * sistema. El comportamiento del route del recorrido NO cambia: solo se movió el
 * cuerpo del insert/update acá, sin tocar la lógica.
 *
 * Fuente de verdad de franjas/horas: `FRANJA_HORA` (mismo mapeo que ya usaba el
 * route y `lib/email/notifications/visit-proposed.ts`).
 */
import { createClient } from '@supabase/supabase-js'
import { notifyVisitProposed } from '@/lib/email/notifications/visit-proposed'
import { advancePipelineState } from '@/lib/leads/pipeline-state'

export type Franja = 'manana' | 'mediodia' | 'tarde'

/** Hora de inicio por franja (hora local de Buenos Aires, UTC-3). */
export const FRANJA_HORA: Record<Franja, number> = { manana: 9, mediodia: 12, tarde: 15 }

/** Etiqueta para prosa al cliente ("por la mañana", "al mediodía", "por la tarde"). */
export const FRANJA_LABEL_PROSA: Record<Franja, string> = {
  manana: 'por la mañana',
  mediodia: 'al mediodía',
  tarde: 'por la tarde',
}

export function isFranja(v: string): v is Franja {
  return v === 'manana' || v === 'mediodia' || v === 'tarde'
}

export function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Fecha de hoy (YYYY-MM-DD) en horario argentino, no en UTC del servidor. */
export function hoyEnArgentina(ref: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ref)
}

/** Suma días a un YYYY-MM-DD sin que la zona horaria mueva el resultado. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Día de semana (0=domingo..6=sábado) de un YYYY-MM-DD, ancla al mediodía UTC — Argentina no tiene DST, así que esto nunca cruza de día. */
export function diaDeSemana(fechaISO: string): number {
  return new Date(`${fechaISO}T12:00:00Z`).getUTCDay()
}

/** Lunes a viernes. */
export function esDiaHabil(fechaISO: string): boolean {
  const dow = diaDeSemana(fechaISO)
  return dow !== 0 && dow !== 6
}

/** Combina fecha (YYYY-MM-DD) + franja en el instante UTC correcto (hora de Argentina, UTC-3 fijo). */
export function scheduledAtFor(fechaISO: string, franja: Franja): Date {
  const hora = FRANJA_HORA[franja]
  return new Date(`${fechaISO}T${String(hora).padStart(2, '0')}:00:00-03:00`)
}

export interface UpsertPendingVisitInput {
  propertyId: string
  advisorId: string | null
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  scheduledAt: Date
  notes: string
  /**
   * Visita `pending_confirmation` existente a ACTUALIZAR en vez de crear una
   * nueva ("la última propuesta gana" — mismo criterio que el route del
   * recorrido). `null`/`undefined` = siempre crear una nueva.
   */
  existingVisitId?: string | null
  /**
   * `true` SOLO cuando la visita la agenda el agente de IA
   * (`lib/ai/scheduling-agent.ts`). Marca la fila con `created_by_ai` para que
   * el panel de costo cuente las visitas del agente como un HECHO y no
   * deduciéndolas por teléfono (ver `summarizeAgentVisits`).
   *
   * OJO — deliberado: la columna solo se manda cuando es `true`. El camino del
   * cliente (`/v/<token>/schedule`, en producción hoy) no la menciona, así que
   * sigue funcionando aunque la migración
   * `20260803000003_property_visits_created_by_ai.sql` todavía no haya corrido.
   * El agente arranca apagado, así que no hay ventana de deploy rota.
   */
  createdByAi?: boolean
}

export type UpsertPendingVisitResult =
  | { ok: true; visitId: string }
  | { ok: false; error: string }

/**
 * Crea o actualiza una `property_visits` en `pending_confirmation`. Mismo
 * comportamiento exacto que tenía inline `app/api/v/[token]/schedule/route.ts`
 * (líneas 107-139 antes de esta extracción): si `existingVisitId` apunta a una
 * visita que SIGUE `pending_confirmation`, se actualiza esa fila; si no (fue
 * confirmada/cancelada, o no existe), se inserta una nueva.
 */
export async function upsertPendingVisit(
  sb: ReturnType<typeof admin>,
  input: UpsertPendingVisitInput,
): Promise<UpsertPendingVisitResult> {
  if (input.existingVisitId) {
    const { data: updated } = await sb
      .from('property_visits')
      .update({ scheduled_at: input.scheduledAt.toISOString(), notes: input.notes })
      .eq('id', input.existingVisitId)
      .eq('status', 'pending_confirmation')
      .select('id')
      .maybeSingle()
    const visitId = (updated as { id: string } | null)?.id ?? null
    if (visitId) return { ok: true, visitId }
  }

  const { data: visit, error } = await sb
    .from('property_visits')
    .insert({
      property_id: input.propertyId,
      advisor_id: input.advisorId,
      client_name: input.clientName,
      client_email: input.clientEmail,
      client_phone: input.clientPhone,
      scheduled_at: input.scheduledAt.toISOString(),
      status: 'pending_confirmation',
      notes: input.notes,
      // Solo presente cuando la crea el agente — ver `createdByAi` arriba.
      ...(input.createdByAi === true ? { created_by_ai: true } : {}),
    })
    .select('id')
    .single()
  if (error || !visit) {
    return { ok: false, error: error?.message ?? 'No pudimos registrar la visita' }
  }
  return { ok: true, visitId: (visit as { id: string }).id }
}

/**
 * Aviso al equipo + avance del embudo. Best-effort en ambos pasos (mismo
 * criterio que el route original): la visita YA está registrada cuando esto
 * corre, así que un fallo acá nunca debe parecer que la visita no se creó.
 */
export async function notifyAndAdvancePipeline(visitId: string, leadId: string | null): Promise<void> {
  try {
    await notifyVisitProposed(visitId)
  } catch (err) {
    console.error('[visit-scheduling] notificación falló (visita igual registrada):', err)
  }
  if (leadId) {
    await advancePipelineState(leadId, 'visit_scheduled')
  }
}
