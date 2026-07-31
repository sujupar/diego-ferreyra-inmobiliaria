/**
 * Gate de acceso a un lead puntual: operaciones (admin/dueno/coordinador) ven
 * cualquiera; el asesor SOLO el suyo (asignado directo, o vía la propiedad
 * asignada a él). El abogado queda afuera (no está en `ALLOWED_ROLES`).
 *
 * Mismo criterio que `authorize()` (no exportado) en
 * `app/api/leads/[id]/route.ts` y `isAsesorOwner` en
 * `app/api/whatsapp/send/route.ts` — factorizado acá porque Task 3 agrega DOS
 * rutas nuevas bajo `/api/leads/[id]/` (`tags`, `state`) que necesitan
 * exactamente esta misma verificación.
 *
 * `property_leads`/`properties` SÍ están en `types/database.types.ts`, pero
 * como esta tarea usa el cliente sin el genérico para las tablas nuevas (ver
 * `lib/leads/tags.ts`), se usa el mismo cliente crudo acá para no mezclar dos
 * instancias de Supabase en el mismo request.
 */
import { createClient } from '@supabase/supabase-js'
import type { UserWithProfile } from '@/types/auth.types'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador', 'asesor']

export type LeadAccessResult = { ok: true } | { ok: false; reason: string; status: number }

export async function authorizeLeadAccess(leadId: string, user: UserWithProfile): Promise<LeadAccessResult> {
  if (!ALLOWED_ROLES.includes(user.profile.role)) {
    return { ok: false, reason: 'forbidden', status: 403 }
  }

  // Hallazgo H6 (revisión adversarial 2026-08-01): antes, para admin/dueño/
  // coordinador esto devolvía `{ok:true}` sin tocar la base — un `leadId`
  // inexistente pasaba el gate y recién explotaba más abajo con un 500 crudo
  // de Postgres (violación de FK al insertar en `lead_tag_assignments`), y un
  // lead en la papelera (`deleted_at` no nulo) se podía etiquetar igual,
  // aunque `advancePipelineState`/`setPipelineStateManually` sí lo bloquean.
  // Ahora TODOS los roles permitidos pasan por el mismo SELECT — 404 real
  // para "no existe" y para "está en la papelera" — y solo el asesor hace,
  // encima, el chequeo de ownership.
  const supabase = admin()
  const { data: lead } = await supabase
    .from('property_leads')
    .select('property_id, assigned_to, deleted_at')
    .eq('id', leadId)
    .maybeSingle()
  const row = lead as { property_id: string; assigned_to: string | null; deleted_at: string | null } | null
  if (!row || row.deleted_at) return { ok: false, reason: 'not_found', status: 404 }

  if (user.profile.role !== 'asesor') return { ok: true }

  if (row.assigned_to === user.id) return { ok: true }

  const { data: prop } = await supabase
    .from('properties')
    .select('assigned_to')
    .eq('id', row.property_id)
    .maybeSingle()
  if ((prop as { assigned_to: string | null } | null)?.assigned_to === user.id) return { ok: true }

  return { ok: false, reason: 'forbidden', status: 403 }
}
