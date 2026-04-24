import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-role'
import { notifyDealCreated } from '@/lib/email/notifications/deal-created'
import { notifyVisitCompleted } from '@/lib/email/notifications/visit-completed'
import { notifyAppraisalSent } from '@/lib/email/notifications/appraisal-sent'
import { notifyPropertyCreated } from '@/lib/email/notifications/property-created'
import { notifyDocsReadyForLawyer } from '@/lib/email/notifications/docs-ready-for-lawyer'
import { notifyPropertyCaptured } from '@/lib/email/notifications/property-captured'

/**
 * Manual resend for admin use. Takes { notificationType, entityId } and
 * re-runs the helper. Note: for idempotent types, the UNIQUE INDEX might skip
 * the resend if the original 'sent' row still exists. The handler accepts that
 * and returns the result verbatim.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission('settings.manage')
    const { notificationType, entityId, secondaryId } = await request.json()
    if (!notificationType || !entityId) {
      return NextResponse.json({ error: 'notificationType y entityId requeridos' }, { status: 400 })
    }

    // Snapshot log counts BEFORE the manual resend, so we can report how many
    // new rows ended up with status='sent' after the retry. This is the most
    // pragmatic way to inform the admin what actually happened given that the
    // notify helpers don't currently propagate their SendEmailResult back.
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const startedAt = new Date().toISOString()

    switch (notificationType) {
      case 'deal_created_advisor':
      case 'deal_created_admins':
        await notifyDealCreated({ dealId: entityId })
        break
      case 'visit_completed':
        await notifyVisitCompleted(entityId)
        break
      case 'appraisal_sent':
        if (!secondaryId) return NextResponse.json({ error: 'secondaryId (dealId) requerido' }, { status: 400 })
        await notifyAppraisalSent(secondaryId, entityId)
        break
      case 'property_created':
        await notifyPropertyCreated(entityId)
        break
      case 'docs_ready_for_lawyer':
        await notifyDocsReadyForLawyer(entityId.split(':')[0])
        break
      case 'property_captured_advisor':
      case 'property_captured_admins':
        await notifyPropertyCaptured(entityId)
        break
      default:
        return NextResponse.json({ error: `Tipo no soportado: ${notificationType}` }, { status: 400 })
    }

    // Inspect log rows created since startedAt to report what really happened.
    const { data: newRows } = await admin
      .from('email_notifications_log')
      .select('status, recipient_email, error_message')
      .gte('sent_at', startedAt)
      .order('sent_at', { ascending: false })
      .limit(50)
    const counts = (newRows || []).reduce(
      (acc: Record<string, number>, r: any) => {
        acc[r.status] = (acc[r.status] || 0) + 1
        return acc
      },
      {}
    )

    return NextResponse.json({ success: true, counts, rows: newRows ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
