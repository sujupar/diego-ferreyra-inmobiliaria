import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getPropertyStakeholders, getUserById, dedupEmails, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { PropertyCapturedEmail } from '@/emails/PropertyCapturedEmail'
import { CongratulationsAsesorEmail } from '@/emails/CongratulationsAsesorEmail'
import { firstName, formatDate, formatMoney, propertyTypeLabel } from '../format'

/**
 * N8A + N8B: captación al 100%.
 *   8A — al asesor (tono celebratorio)
 *   8B — a coordinador + admins+dueños (informativo KPI)
 * Ambos son idempotentes por propertyId — el UNIQUE INDEX evita el doble disparo
 * cuando la captación se alcanza desde el camino abogado-aprueba o fotos-subidas.
 */
export async function notifyPropertyCaptured(propertyId: string) {
  const { asesor, coordinador, adminsOwners, propertyRow, linkedDeal } = await getPropertyStakeholders(propertyId)
  if (!propertyRow) return

  const lawyer = propertyRow.legal_reviewer_id ? await getUserById(propertyRow.legal_reviewer_id) : null
  const lawyerName = lawyer?.full_name || null
  const advisorName = asesor?.full_name || 'Asesor'

  const capturedAt = formatDate(propertyRow.legal_reviewed_at || propertyRow.updated_at || new Date().toISOString())

  // Days from deal creation to capture (informative KPI). linkedDeal viene del
  // stakeholders helper — evita segundo query a deals.
  let daysFromDealToCapture: number | null = null
  if (linkedDeal?.created_at && propertyRow.legal_reviewed_at) {
    const start = new Date(linkedDeal.created_at).getTime()
    const end = new Date(propertyRow.legal_reviewed_at).getTime()
    if (!isNaN(start) && !isNaN(end) && end > start) {
      daysFromDealToCapture = Math.round((end - start) / (1000 * 60 * 60 * 24))
    }
  }

  const askingPriceFmt = formatMoney(propertyRow.asking_price, propertyRow.currency)
  const commissionAmt =
    propertyRow.asking_price != null && propertyRow.commission_percentage != null
      ? formatMoney(propertyRow.asking_price * (propertyRow.commission_percentage / 100), propertyRow.currency)
      : null

  // === 8A — al asesor (celebratorio) ===
  if (asesor?.email) {
    const testA = await applyTestMode([asesor.email], '¡Lograste una nueva captación!')
    const htmlA = await renderEmail(
      CongratulationsAsesorEmail({
        advisorFirstName: firstName(asesor.full_name) || 'equipo',
        lawyerName,
        propertyId,
        propertyAddress: propertyRow.address,
        neighborhood: propertyRow.neighborhood,
        propertyType: propertyTypeLabel(propertyRow.property_type),
        askingPrice: askingPriceFmt,
        currency: propertyRow.currency,
        commissionPct: propertyRow.commission_percentage,
        capturedAt,
        testMode: testA.testModeOn,
        originalRecipients: testA.originalTo,
      }) as any
    )
    await sendEmail({
      notificationType: 'property_captured_advisor',
      entityType: 'property',
      entityId: propertyId,
      to: asesor.email,
      subject: `¡Lograste una nueva captación! — ${propertyRow.address}`,
      html: htmlA,
    })
  }

  // === 8B — a coordinador + admins+dueños ===
  const adminsTo = dedupEmails(
    coordinador?.email ? [coordinador.email] : [],
    emailsOf(adminsOwners),
  )
  if (adminsTo.length > 0) {
    const testB = await applyTestMode(adminsTo, 'Nueva captación al 100%')
    const htmlB = await renderEmail(
      PropertyCapturedEmail({
        advisorName,
        lawyerName,
        propertyId,
        propertyAddress: propertyRow.address,
        neighborhood: propertyRow.neighborhood,
        propertyType: propertyTypeLabel(propertyRow.property_type),
        askingPrice: askingPriceFmt,
        currency: propertyRow.currency,
        commissionAmount: commissionAmt,
        daysFromDealToCapture,
        capturedAt,
        testMode: testB.testModeOn,
        originalRecipients: testB.originalTo,
        recipientRole: 'coordinador, administrador o dueño',
      }) as any
    )
    await sendEmail({
      notificationType: 'property_captured_admins',
      entityType: 'property',
      entityId: propertyId,
      to: adminsTo,
      subject: `Nueva captación al 100% — ${propertyRow.address} (${advisorName})`,
      html: htmlB,
    })
  }
}
