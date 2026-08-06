import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { resolveSequenceTag } from './mapping'
import { needsResync } from './reconcile-core'
import { syncDealToMailchimp } from './sync-deal'
import { mailchimpSyncEnabled } from './client'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * Barrido de auto-reparación: compara el tag que corresponde HOY (por etapa)
 * contra el último sincronizado (ledger) y re-sincroniza los que driftaron.
 * Best-effort: nunca tira. Respeta el interruptor maestro.
 */
export async function reconcileMailchimp(limit = 1000): Promise<{ scanned: number; resynced: number }> {
  if (!mailchimpSyncEnabled()) return { scanned: 0, resynced: 0 }
  const sb = admin()
  // deals relevantes: los que pueden estar (o haber estado) en una secuencia.
  const { data: deals, error } = await sb.from('deals')
    .select('id, stage, origin, scheduled_date, mailchimp_sync_state ( last_tag )')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) {
    // La red de seguridad no debe morir en silencio: dejamos rastro del fallo.
    console.warn('[mailchimp] reconcile: query de deals falló:', error.message)
    try {
      await sb.from('mailchimp_sync_log').insert({ deal_id: null, email: null, tag_applied: null, status: 'failed', error: `reconcile query: ${error.message}` })
    } catch { /* best-effort */ }
    return { scanned: 0, resynced: 0 }
  }
  const rows = (deals as any[]) || []
  let resynced = 0
  for (const d of rows) {
    const target = resolveSequenceTag({ stage: d.stage, origin: d.origin, scheduledDate: d.scheduled_date })
    const ledgerTag = d.mailchimp_sync_state?.last_tag ?? null
    if (needsResync(target, ledgerTag)) {
      await syncDealToMailchimp(d.id) // best-effort, nunca tira
      resynced++
    }
  }
  return { scanned: rows.length, resynced }
}
