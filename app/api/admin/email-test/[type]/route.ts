import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/require-role'
import {
    notifyDealCreated,
    notifyVisitCompleted,
    notifyAppraisalSent,
    notifyPropertyCreated,
    notifyDocsReadyForLawyer,
    notifyDocRejected,
    notifyDocsResubmitted,
    notifyPropertyCaptured,
} from '@/lib/email/notifications'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/email-test/[type]
 *
 * Reenvía una notificación transaccional usando una entidad real existente
 * (deal/appraisal/property). Pensado para que admin/dueño verifique en su
 * inbox que cada tipo llega correctamente.
 *
 * Recomendado: activar `notification_settings.test_mode_enabled` antes de usar
 * este endpoint, para que los emails se redirijan al `test_recipient_email`.
 *
 * Body: { dealId?, appraisalId?, propertyId?, itemKey?, reviewerId?, errors? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
    try {
        await requireRole('admin', 'dueno')
        const { type } = await params
        const body = await req.json().catch(() => ({}))

        const requireField = (name: string, value: unknown) => {
            if (!value || typeof value !== 'string') {
                throw new Error(`Missing required field "${name}" in body`)
            }
            return value
        }

        switch (type) {
            case 'deal_created': {
                const dealId = requireField('dealId', body.dealId)
                await notifyDealCreated({ dealId })
                break
            }
            case 'visit_completed': {
                const dealId = requireField('dealId', body.dealId)
                await notifyVisitCompleted(dealId)
                break
            }
            case 'appraisal_sent': {
                const dealId = requireField('dealId', body.dealId)
                const appraisalId = requireField('appraisalId', body.appraisalId)
                await notifyAppraisalSent(dealId, appraisalId)
                break
            }
            case 'property_created': {
                const propertyId = requireField('propertyId', body.propertyId)
                await notifyPropertyCreated(propertyId)
                break
            }
            case 'docs_ready_for_lawyer': {
                const propertyId = requireField('propertyId', body.propertyId)
                await notifyDocsReadyForLawyer(propertyId)
                break
            }
            case 'doc_rejected': {
                const propertyId = requireField('propertyId', body.propertyId)
                const itemKey = requireField('itemKey', body.itemKey)
                const reviewerId = requireField('reviewerId', body.reviewerId)
                await notifyDocRejected({ propertyId, itemKey, reviewerId, reviewerNotes: body.notes || 'Test review' })
                break
            }
            case 'docs_resubmitted': {
                const propertyId = requireField('propertyId', body.propertyId)
                const itemKey = requireField('itemKey', body.itemKey)
                await notifyDocsResubmitted({ propertyId, itemKey, previousReviewerId: body.reviewerId || null })
                break
            }
            case 'property_captured': {
                const propertyId = requireField('propertyId', body.propertyId)
                await notifyPropertyCaptured(propertyId)
                break
            }
            default:
                return NextResponse.json({ error: `Unknown email type: ${type}` }, { status: 400 })
        }

        return NextResponse.json({ ok: true, type })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error'
        console.error(`[email-test] ${(await params).type} failed:`, message)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}
