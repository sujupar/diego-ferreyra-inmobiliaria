import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getPropertyStakeholders, getUserById, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { DocsResubmittedEmail } from '@/emails/DocsResubmittedEmail'
import { LEGAL_DOCS_CATALOG } from '@/types/legal-docs.types'
import { firstName, formatDateTime } from '../format'

/**
 * N7: asesor resube un doc previamente rechazado.
 * Prioriza el abogado que rechazó originalmente (reviewedBy del item).
 * Si no está disponible, fallback a todos los abogados activos con disclaimer.
 */
export async function notifyDocsResubmitted(params: {
  propertyId: string
  itemKey: string
  previousReviewerId: string | null
}) {
  const { propertyId, itemKey, previousReviewerId } = params
  const { propertyRow, lawyers, asesor } = await getPropertyStakeholders(propertyId)
  if (!propertyRow) return

  const originalReviewer = previousReviewerId ? await getUserById(previousReviewerId) : null
  const advisorName = asesor?.full_name || 'El asesor'
  const docLabel = LEGAL_DOCS_CATALOG.find(d => d.key === itemKey)?.label || itemKey

  let to: string[] = []
  let isFallbackToAllLawyers = false
  if (originalReviewer?.email) {
    to = [originalReviewer.email]
  } else {
    to = emailsOf(lawyers)
    isFallbackToAllLawyers = true
  }
  if (to.length === 0) return

  const testCtx = await applyTestMode(to, `Documentación actualizada — ${propertyRow.address}`)
  const html = await renderEmail(
    DocsResubmittedEmail({
      lawyerFirstName: originalReviewer ? firstName(originalReviewer.full_name) : null,
      advisorName,
      propertyId,
      propertyAddress: propertyRow.address,
      docLabel,
      updatedAt: formatDateTime(new Date().toISOString()),
      isFallbackToAllLawyers,
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
    }) as any
  )

  await sendEmail({
    notificationType: 'docs_resubmitted',
    entityType: 'property',
    entityId: `${propertyId}:${itemKey}:${Date.now()}`,
    to,
    subject: `Documentación actualizada — ${propertyRow.address}`,
    html,
    idempotent: false,
  })
}
