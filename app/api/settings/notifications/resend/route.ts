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

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
