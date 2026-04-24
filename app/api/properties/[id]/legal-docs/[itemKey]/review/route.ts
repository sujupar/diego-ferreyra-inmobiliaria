import { NextRequest, NextResponse } from 'next/server'
import { upsertLegalDocItem, checkGlobalApproval } from '@/lib/supabase/legal-docs'
import { requirePermission } from '@/lib/auth/require-role'
import { logLegalEvent } from '@/lib/supabase/legal-events'
import { notifyDocRejected } from '@/lib/email/notifications/doc-rejected'
import { notifyAdminEmailFailure } from '@/lib/email/notifications/admin-failure-alert'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemKey: string }> }) {
  const user = await requirePermission('properties.review')
  const { id, itemKey } = await params
  const { approved, notes } = await req.json()

  await upsertLegalDocItem(id, itemKey, {
    status: approved ? 'approved' : 'rejected',
    reviewer_notes: notes || null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
  })

  // Auto-escalate to global approval if all mandatory+temporal items are approved.
  // checkGlobalApproval sets property.legal_status='approved' but NOT status — that
  // transition (and the N8A/N8B emails) happen inside reviewProperty() /
  // checkAndAdvanceProperty() in lib/supabase/properties.ts, so we don't need
  // to fire the captured notifications here. See fix R1 C5.
  if (approved) {
    try { await checkGlobalApproval(id) } catch (e) { console.error('checkGlobalApproval error:', e) }
  }

  try {
    await logLegalEvent({
      property_id: id,
      actor_id: user.id,
      actor_role: user.profile.role,
      action: approved ? 'approved_item' : 'rejected_item',
      item_key: itemKey,
      notes: notes || null,
    })
  } catch (e) { console.error('logLegalEvent error:', e) }

  // N6: doc rechazado — notificar asesor+coordinador con las notas del abogado.
  if (!approved) {
    try {
      await notifyDocRejected({ propertyId: id, itemKey, reviewerNotes: notes || null, reviewerId: user.id })
    } catch (err) {
      console.error('[notify] doc-rejected:', err)
      try {
        await notifyAdminEmailFailure({
          failedNotificationType: 'doc_rejected',
          entityType: 'property',
          entityId: `${id}:${itemKey}`,
          errors: [err instanceof Error ? err.message : String(err)],
        })
      } catch { /* no recurrence on failure alerts */ }
    }
  }

  return NextResponse.json({ ok: true })
}
