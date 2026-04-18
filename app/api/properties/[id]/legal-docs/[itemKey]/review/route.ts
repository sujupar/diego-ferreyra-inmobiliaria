import { NextRequest, NextResponse } from 'next/server'
import { upsertLegalDocItem, checkGlobalApproval } from '@/lib/supabase/legal-docs'
import { requirePermission } from '@/lib/auth/require-role'
import { logLegalEvent } from '@/lib/supabase/legal-events'

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

  // Auto-escalate to global approval if all mandatory+temporal items are approved
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

  return NextResponse.json({ ok: true })
}
