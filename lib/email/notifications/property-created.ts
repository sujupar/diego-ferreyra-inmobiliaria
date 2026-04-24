import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getPropertyStakeholders, dedupEmails, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { PropertyCreatedEmail } from '@/emails/PropertyCreatedEmail'
import { formatMoney, propertyTypeLabel } from '../format'

export async function notifyPropertyCreated(propertyId: string) {
  const { asesor, coordinador, adminsOwners, propertyRow } = await getPropertyStakeholders(propertyId)
  if (!propertyRow) return

  const advisorName = asesor?.full_name || 'El asesor'
  const to = dedupEmails(
    [coordinador?.email].filter(Boolean) as string[],
    emailsOf(adminsOwners),
    asesor?.email ? [asesor.email] : [],
  )
  if (to.length === 0) return

  const testCtx = await applyTestMode(to, 'Nueva propiedad cargada (pendiente docs)')
  const html = await renderEmail(
    PropertyCreatedEmail({
      advisorName,
      propertyId,
      propertyAddress: propertyRow.address,
      neighborhood: propertyRow.neighborhood,
      propertyType: propertyTypeLabel(propertyRow.property_type),
      askingPrice: formatMoney(propertyRow.asking_price, propertyRow.currency),
      currency: propertyRow.currency,
      commissionPct: propertyRow.commission_percentage,
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
      recipientRole: 'parte del equipo',
    }) as any
  )
  await sendEmail({
    notificationType: 'property_created',
    entityType: 'property',
    entityId: propertyId,
    to,
    subject: `Nueva propiedad cargada — ${propertyRow.address} (pendiente docs)`,
    html,
  })
}
