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
 * FK real — es un match de mejor esfuerzo. Desde la migración 20261010000002
 * `property_visits.lead_id` existe y la ruta de estado lo usa primero: este
 * respaldo queda para las visitas viejas que no lo tienen. Teléfono por
 * últimos 10 dígitos (`phone_norm`) y email sin distinguir mayúsculas
 * (revisión final, grupo L). Si no matchea nada, se devuelve `null` y el caller
 * simplemente no avanza el estado: no rompe nada (mismo contrato que
 * `resolveLeadIdForVisit`: nunca lanza).
 *
 * No se agregó ESTA lógica a `pipeline-state.ts` porque esa tarea (Task 1+2)
 * está fuera de alcance para esta tarea (ver CLAUDE.md / brief: "NO toques
 * lib/leads/tags.ts / pipeline-state.ts").
 */
import { createClient } from '@supabase/supabase-js'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { resolveLeadIdForVisit } from './pipeline-state'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Sin `!`: si faltan, el catch de abajo lo registra y devuelve null (contrato: nunca lanza).
  if (!url || !key) throw new Error('Faltan las credenciales de Supabase en el servidor')
  return createClient(url, key)
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
    const { data: visit, error: errorVisita } = await sb
      .from('property_visits')
      .select('property_id, client_email, client_phone')
      .eq('id', visitId)
      .maybeSingle()
    // supabase-js NO lanza ante un error de Postgres: devuelve { error }.
    if (errorVisita) {
      console.warn('[resolve-crm-visit-lead] no se pudo leer la visita (continuando):', errorVisita.message)
      return null
    }
    const v = visit as { property_id: string; client_email: string | null; client_phone: string | null } | null
    if (!v) return null

    // Email: normalizado (trim + minúsculas) y con ilike, porque el lead pudo
    // guardarse con otra capitalización. % _ \ se escapan: son comodines de LIKE y
    // un email con "_" o "%" matchearía el de OTRA persona.
    const email = v.client_email?.trim().toLowerCase() || null
    if (email) {
      const { data, error } = await sb
        .from('property_leads')
        .select('id')
        .eq('property_id', v.property_id)
        .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) console.warn('[resolve-crm-visit-lead] búsqueda por email falló (continuando):', error.message)
      const id = (data as { id: string } | null)?.id
      if (id) return id
    }

    // Teléfono: NUNCA igualdad exacta (CLAUDE.md § Teléfonos). El mismo celular vive
    // como '+5491158234521', '+541158234521' o '1158234521': se compara por
    // `phone_norm` (últimos 10 dígitos, columna generada). Sin 10 dígitos no se busca.
    const norm = ultimos10Digitos(v.client_phone)
    if (norm) {
      const { data, error } = await sb
        .from('property_leads')
        .select('id')
        .eq('property_id', v.property_id)
        .eq('phone_norm', norm)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) console.warn('[resolve-crm-visit-lead] búsqueda por teléfono falló (continuando):', error.message)
      const id = (data as { id: string } | null)?.id
      if (id) return id
    }

    return null
  } catch (err) {
    console.warn('[resolve-crm-visit-lead] no se pudo resolver (continuando):', err)
    return null
  }
}
