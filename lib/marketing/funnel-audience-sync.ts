import { createClient } from '@supabase/supabase-js'
import {
  createCustomerListAudience,
  addUsersToAudience,
  removeUsersFromAudience,
} from './meta-custom-audiences'
import { hashContactRow, memberKey, type ContactPii } from './audience-hash'

/** Etapa → nombre de público + si se excluye del prospecting. */
export const STAGE_AUDIENCES: { stage: string; name: string; excludeFromProspecting: boolean }[] = [
  { stage: 'clase_gratuita', name: 'CRM · Registró Clase', excludeFromProspecting: false },
  { stage: 'request', name: 'CRM · Solicitó Tasación', excludeFromProspecting: false },
  { stage: 'scheduled', name: 'CRM · Tasación Coordinada', excludeFromProspecting: false },
  { stage: 'visited', name: 'CRM · Visita Realizada', excludeFromProspecting: false },
  { stage: 'appraisal_sent', name: 'CRM · Tasación Entregada', excludeFromProspecting: false },
  { stage: 'followup', name: 'CRM · En Seguimiento', excludeFromProspecting: false },
  { stage: 'captured', name: 'CRM · Captado', excludeFromProspecting: true },
  { stage: 'lost', name: 'CRM · Perdido', excludeFromProspecting: true },
]

export function computeDiff(desired: Set<string>, ledger: Set<string>): { toAdd: string[]; toRemove: string[] } {
  const toAdd = [...desired].filter((x) => !ledger.has(x))
  const toRemove = [...ledger].filter((x) => !desired.has(x))
  return { toAdd, toRemove }
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Crea en Meta los públicos que falten y los registra en funnel_meta_audiences. */
export async function ensureStageAudiences(): Promise<Record<string, string>> {
  const supabase = admin()
  const { data: existing } = await supabase.from('funnel_meta_audiences').select('stage, audience_id')
  const map: Record<string, string> = {}
  for (const row of (existing ?? []) as { stage: string; audience_id: string }[]) map[row.stage] = row.audience_id
  for (const a of STAGE_AUDIENCES) {
    if (map[a.stage]) continue
    const audienceId = await createCustomerListAudience(a.name, `Público CRM etapa ${a.stage}`)
    await supabase.from('funnel_meta_audiences').insert({
      stage: a.stage, audience_id: audienceId, name: a.name, exclude_from_prospecting: a.excludeFromProspecting,
    })
    map[a.stage] = audienceId
  }
  return map
}

/**
 * Fila de deal con su contacto embebido.
 *
 * OJO (ajuste a la realidad de la DB): la columna de ciudad/barrio NO vive en
 * `contacts` sino en `deals.neighborhood` (la tabla `contacts` solo tiene
 * id/full_name/phone/email — ver migración 20260410_contacts_scheduled.sql y el
 * embedding de getDeals en lib/supabase/deals.ts). Por eso seleccionamos
 * `neighborhood` a nivel deal y lo mapeamos a `ContactPii.city`.
 */
interface DealContact {
  contact_id: string
  stage: string
  neighborhood: string | null
  contacts: { id: string; full_name: string | null; email: string | null; phone: string | null } | null
}

/** Sincroniza TODAS las etapas: reconcilia deseado (deals en la etapa) vs ledger. Best-effort. */
export async function syncAllStages(): Promise<{ stage: string; added: number; removed: number; error?: string }[]> {
  const supabase = admin()
  const audiences = await ensureStageAudiences()
  const results: { stage: string; added: number; removed: number; error?: string }[] = []

  // Traer deals de origin embudo/clase_gratuita con su contacto, agrupar por stage.
  // El barrio (ciudad) vive en deals.neighborhood, no en contacts.
  const { data: deals } = await supabase
    .from('deals')
    .select('contact_id, stage, neighborhood, contacts:contact_id ( id, full_name, email, phone )')
    .in('origin', ['embudo', 'clase_gratuita'])
  const byStage = new Map<string, Map<string, ContactPii>>()
  for (const d of (deals ?? []) as unknown as DealContact[]) {
    if (!d.contact_id || !d.contacts) continue
    if (!byStage.has(d.stage)) byStage.set(d.stage, new Map())
    byStage.get(d.stage)!.set(d.contact_id, {
      fullName: d.contacts.full_name ?? '',
      email: d.contacts.email,
      phone: d.contacts.phone,
      city: d.neighborhood ?? null,
    })
  }

  for (const a of STAGE_AUDIENCES) {
    try {
      const audienceId = audiences[a.stage]
      const desiredMap = byStage.get(a.stage) ?? new Map<string, ContactPii>()
      const desired = new Set(desiredMap.keys())
      const { data: led } = await supabase
        .from('funnel_meta_audience_members')
        .select('contact_id').eq('stage', a.stage).eq('status', 'active')
      const ledger = new Set(((led ?? []) as { contact_id: string }[]).map((r) => r.contact_id))
      const { toAdd, toRemove } = computeDiff(desired, ledger)

      // Altas
      if (toAdd.length) {
        const rows = toAdd.map((cid) => hashContactRow(desiredMap.get(cid)!))
        const r = await addUsersToAudience(audienceId, rows)
        for (const cid of toAdd) {
          const mk = memberKey(desiredMap.get(cid)!)
          await supabase.from('funnel_meta_audience_members').upsert(
            { stage: a.stage, contact_id: cid, hashed_email: mk.hashedEmail, hashed_phone: mk.hashedPhone, status: 'active', last_synced_at: new Date().toISOString() },
            { onConflict: 'stage,contact_id' },
          )
        }
        if (!r.ok) throw new Error(r.error)
      }
      // Bajas (mismos hashes guardados en el ledger → reconstruir fila desde hashed_*)
      if (toRemove.length) {
        const { data: rows2 } = await supabase
          .from('funnel_meta_audience_members')
          .select('contact_id, hashed_email, hashed_phone').eq('stage', a.stage).in('contact_id', toRemove)
        const delRows = ((rows2 ?? []) as { hashed_email: string | null; hashed_phone: string | null }[])
          .map((m) => [m.hashed_email ?? '', m.hashed_phone ?? '', '', '', '', ''])
        const r = await removeUsersFromAudience(audienceId, delRows)
        await supabase.from('funnel_meta_audience_members')
          .update({ status: 'removed', last_synced_at: new Date().toISOString() })
          .eq('stage', a.stage).in('contact_id', toRemove)
        if (!r.ok) throw new Error(r.error)
      }

      await supabase.from('funnel_meta_sync_log').insert({ stage: a.stage, added: toAdd.length, removed: toRemove.length })
      results.push({ stage: a.stage, added: toAdd.length, removed: toRemove.length })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await supabase.from('funnel_meta_sync_log').insert({ stage: a.stage, error: msg })
      results.push({ stage: a.stage, added: 0, removed: 0, error: msg })
    }
  }
  return results
}
