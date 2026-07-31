/**
 * Resuelve el `lead_id` de una `property_visits` para poder disparar
 * `advancePipelineState` (Task 2, `./pipeline-state.ts`) también cuando la
 * visita NO nació del recorrido público (`app/api/v/[token]/schedule/`).
 *
 * `resolveLeadIdForVisit` (pipeline-state.ts) SOLO resuelve vía
 * `lead_access_tokens.visit_id` — el vínculo que arma el flujo público. Las
 * visitas que el equipo carga a mano desde el CRM (`POST /api/visits`,
 * `PUT /api/visits/[id]`, `POST /api/visits/[id]/complete`) nunca pasan por
 * ahí, así que para ellas SIEMPRE devuelve `null` y el estado del comprador
 * no avanza — hueco señalado en el brief de Task 3.
 *
 * Este módulo agrega un FALLBACK best-effort: si no hay token, busca un
 * `property_leads` de la MISMA propiedad cuyo email o teléfono coincida con
 * el contacto cargado en la visita (`client_email`/`client_phone`). No es una
 * FK real — `property_visits` no tiene columna `lead_id` propia (ver
 * `types/visits.types.ts` / migración `20260513000001`) — es un match de
 * mejor esfuerzo. Si no matchea nada, se devuelve `null` y el caller
 * simplemente no avanza el estado: no rompe nada (mismo contrato que
 * `resolveLeadIdForVisit`: nunca lanza).
 *
 * No se agregó ESTA lógica a `pipeline-state.ts` porque esa tarea (Task 1+2)
 * está fuera de alcance para esta tarea (ver CLAUDE.md / brief: "NO toques
 * lib/leads/tags.ts / pipeline-state.ts").
 */
import { createClient } from '@supabase/supabase-js'
import { resolveLeadIdForVisit } from './pipeline-state'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function resolveLeadIdForVisitWithFallback(visitId: string): Promise<string | null> {
  try {
    // 1) Visita nacida del recorrido público: vínculo directo y confiable.
    const viaToken = await resolveLeadIdForVisit(visitId)
    if (viaToken) return viaToken

    // 2) Visita cargada a mano desde el CRM: sin token. Match best-effort por
    //    email/teléfono DENTRO de la misma propiedad (evita cruzar leads de
    //    otra ficha que casualmente comparten contacto).
    const sb = admin()
    const { data: visit } = await sb
      .from('property_visits')
      .select('property_id, client_email, client_phone')
      .eq('id', visitId)
      .maybeSingle()
    const v = visit as { property_id: string; client_email: string | null; client_phone: string | null } | null
    if (!v) return null

    if (v.client_email) {
      const { data } = await sb
        .from('property_leads')
        .select('id')
        .eq('property_id', v.property_id)
        .eq('email', v.client_email)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const id = (data as { id: string } | null)?.id
      if (id) return id
    }

    if (v.client_phone) {
      const { data } = await sb
        .from('property_leads')
        .select('id')
        .eq('property_id', v.property_id)
        .eq('phone', v.client_phone)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const id = (data as { id: string } | null)?.id
      if (id) return id
    }

    return null
  } catch (err) {
    console.warn('[resolve-crm-visit-lead] no se pudo resolver (continuando):', err)
    return null
  }
}
