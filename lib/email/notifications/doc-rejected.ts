import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getPropertyStakeholders, getUserById, dedupEmails } from '../recipients'
import { applyTestMode } from '../test-mode'
import { DocRejectedEmail } from '@/emails/DocRejectedEmail'
import { LEGAL_DOCS_CATALOG } from '@/types/legal-docs.types'
import { firstName, formatDateTime } from '../format'

export async function notifyDocRejected(params: {
  propertyId: string
  itemKey: string
  reviewerNotes: string | null
  reviewerId: string
}) {
  const { propertyId, itemKey, reviewerNotes, reviewerId } = params
  const [{ asesor, coordinador, propertyRow }, lawyer] = await Promise.all([
    getPropertyStakeholders(propertyId),
    getUserById(reviewerId),
  ])
  if (!propertyRow) return
  if (!asesor?.email && !coordinador?.email) return

  const lawyerName = lawyer?.full_name || 'El abogado'
  const docLabel = LEGAL_DOCS_CATALOG.find(d => d.key === itemKey)?.label || itemKey

  const to = dedupEmails(
    asesor?.email ? [asesor.email] : [],
    coordinador?.email ? [coordinador.email] : [],
  )
  if (to.length === 0) return

  const testCtx = await applyTestMode(to, `Revisión legal — ajustes pedidos en ${propertyRow.address}`)
  const html = await renderEmail(
    DocRejectedEmail({
      advisorFirstName: firstName(asesor?.full_name) || 'equipo',
      lawyerName,
      propertyId,
      propertyAddress: propertyRow.address,
      docLabel,
      reviewerNotes,
      reviewedAt: formatDateTime(new Date().toISOString()),
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
      recipientRole: 'asesor o coordinador',
    }) as any
  )

  // idempotent=false: un mismo doc puede rechazarse en ciclos sucesivos.
  // Sin entity_id, el UNIQUE INDEX no aplica.
  await sendEmail({
    notificationType: 'doc_rejected',
    entityType: 'property',
    entityId: `${propertyId}:${itemKey}:${Date.now()}`,
    to,
    subject: `Revisión legal — ajustes pedidos en ${propertyRow.address}`,
    html,
    idempotent: false,
  })
}
