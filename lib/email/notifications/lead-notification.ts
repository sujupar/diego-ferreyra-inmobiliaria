import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getUserById } from '../recipients'
import { applyTestMode } from '../test-mode'
import { LeadNotificationEmail } from '@/emails/LeadNotificationEmail'
import { firstName, formatDate } from '../format'

export interface NotifyLeadInput {
  leadId: string
  propertyId: string
  propertyAddress: string
  propertyTitle: string | null
  neighborhood: string | null
  assignedTo: string | null
  leadName: string
  leadEmail: string | null
  leadPhone: string | null
  leadMessage: string | null
  source: string
  utm: Record<string, string>
  createdAt: string
}

/**
 * Envía email al asesor asignado cuando llega un nuevo lead.
 * Si no hay asesor asignado, no envía (deja que el inbox del coordinador
 * lo procese — implementación de inbox en M13).
 */
export async function notifyLeadReceived(input: NotifyLeadInput): Promise<void> {
  if (!input.assignedTo) {
    console.log('[lead-notification] no assigned_to, skipping email')
    return
  }
  const advisor = await getUserById(input.assignedTo)
  if (!advisor?.email) {
    console.log('[lead-notification] advisor has no email, skipping')
    return
  }

  const test = await applyTestMode([advisor.email], 'Nueva consulta sobre tu propiedad')
  const html = await renderEmail(
    LeadNotificationEmail({
      advisorFirstName: firstName(advisor.full_name) || 'asesor',
      propertyId: input.propertyId,
      propertyAddress: input.propertyAddress,
      propertyTitle: input.propertyTitle,
      neighborhood: input.neighborhood,
      leadName: input.leadName,
      leadEmail: input.leadEmail,
      leadPhone: input.leadPhone,
      leadMessage: input.leadMessage,
      source: input.source,
      utm: input.utm,
      createdAt: formatDate(input.createdAt),
      testMode: test.testModeOn,
      originalRecipients: test.originalTo,
    }) as never,
  )

  await sendEmail({
    notificationType: 'lead_received_advisor',
    entityType: 'property',
    entityId: input.propertyId,
    to: advisor.email,
    subject: `Nueva consulta: ${input.propertyAddress}`,
    html,
    idempotent: false, // cada lead es un evento nuevo, no deduplicar
  })
}
