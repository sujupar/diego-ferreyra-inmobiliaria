import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { resolveSequenceTag } from './mapping'
import { computeTagOps } from './tag-ops'
import { mergeFieldsFor } from './subscriber'
import { getMailchimpConfig, mailchimpSyncEnabled, upsertMember, setMemberTags } from './client'
import { isSuppressed } from './suppressions'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function logSync(row: { deal_id: string; email: string | null; tag_applied: string | null; status: string; error?: string }) {
  try { await admin().from('mailchimp_sync_log').insert(row) } catch (e) { console.warn('[mailchimp] log insert failed:', e) }
}

/**
 * Sincroniza UN deal con Mailchimp según su etapa ACTUAL. Best-effort: NUNCA
 * tira. Respeta el interruptor maestro (fail-closed). Idempotente.
 */
export async function syncDealToMailchimp(dealId: string): Promise<void> {
  try {
    if (!mailchimpSyncEnabled()) {
      await logSync({ deal_id: dealId, email: null, tag_applied: null, status: 'skipped_disabled' })
      return
    }
    const cfg = getMailchimpConfig()
    if (!cfg) { console.warn('[mailchimp] config incompleta; skip'); return }

    const sb = admin()
    const { data: deal } = await sb.from('deals')
      .select('id, stage, origin, scheduled_date, contacts:contact_id ( full_name, email )')
      .eq('id', dealId).maybeSingle()
    if (!deal) return

    const d = deal as any
    const contact = d.contacts
    const email: string | null = contact?.email?.trim()?.toLowerCase() || null
    const fullName: string | null = contact?.full_name ?? null
    const targetTag = resolveSequenceTag({ stage: d.stage, origin: d.origin, scheduledDate: d.scheduled_date })

    if (!email) { await logSync({ deal_id: dealId, email: null, tag_applied: targetTag, status: 'skipped_no_email' }); return }
    if (await isSuppressed(email)) { await logSync({ deal_id: dealId, email, tag_applied: targetTag, status: 'suppressed' }); return }

    // Evitar inflar la audiencia paga: si no corresponde ninguna secuencia
    // (targetTag null) y el deal NUNCA se sincronizó (sin fila en el ledger),
    // no lo agregamos a Mailchimp. Un deal que SÍ estuvo en una secuencia (con
    // fila en el ledger) igual se procesa, para desactivar sus tags y que salga.
    if (targetTag === null) {
      const { data: existing } = await sb.from('mailchimp_sync_state').select('deal_id').eq('deal_id', dealId).maybeSingle()
      if (!existing) { await logSync({ deal_id: dealId, email, tag_applied: null, status: 'skipped_no_sequence' }); return }
    }

    const up = await upsertMember(cfg, email, mergeFieldsFor(fullName, d.stage))
    if (!up.ok) { await logSync({ deal_id: dealId, email, tag_applied: targetTag, status: 'failed', error: up.error }); return }

    const { activate, deactivate } = computeTagOps(targetTag)
    const tg = await setMemberTags(cfg, email, activate, deactivate)
    if (!tg.ok) { await logSync({ deal_id: dealId, email, tag_applied: targetTag, status: 'failed', error: tg.error }); return }

    try {
      await sb.from('mailchimp_sync_state').upsert(
        { deal_id: dealId, last_tag: targetTag, last_email: email, synced_at: new Date().toISOString() },
        { onConflict: 'deal_id' },
      )
    } catch (e) { console.warn('[mailchimp] ledger upsert failed:', e) }

    await logSync({ deal_id: dealId, email, tag_applied: targetTag, status: 'synced' })
  } catch (err) {
    console.warn('[mailchimp] syncDealToMailchimp failed (ignored):', err instanceof Error ? err.message : err)
    try { await logSync({ deal_id: dealId, email: null, tag_applied: null, status: 'failed', error: err instanceof Error ? err.message : String(err) }) } catch {}
  }
}
