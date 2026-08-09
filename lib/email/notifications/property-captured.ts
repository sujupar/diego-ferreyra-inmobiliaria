import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getPropertyStakeholders, getUserById, dedupEmails, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { PropertyCapturedEmail } from '@/emails/PropertyCapturedEmail'
import { CongratulationsAsesorEmail } from '@/emails/CongratulationsAsesorEmail'
import { firstName, formatDate, formatMoney, propertyTypeLabel } from '../format'
import { copyCaptacion } from '../captacion-copy'

/**
 * N8A + N8B: nueva captación.
 *   8A — al asesor (tono celebratorio)
 *   8B — a coordinador + admins+dueños (informativo KPI)
 *
 * Quién frena el doble envío: `properties.captured_at`, reclamado de forma
 * ATÓMICA en `checkAndAdvanceProperty`. El UNIQUE de `email_notifications_log`
 * nunca alcanzó — esa tabla no tiene ni una fila de 'property_captured'.
 *
 * El texto NO da por hecho que la documentación esté aprobada: desde
 * 2026-08-09 una propiedad se capta con fotos y sin papeles revisados.
 */
export async function notifyPropertyCaptured(propertyId: string) {
  const { asesor, coordinador, adminsOwners, propertyRow, linkedDeal } = await getPropertyStakeholders(propertyId)
  if (!propertyRow) return

  // Desde 2026-08-09 la captación NO implica documentación aprobada: hay que
  // preguntarlo. Las dos piezas lo afirmaban en su texto fijo, así que salían
  // mintiendo sobre cualquier propiedad captada sin papeles revisados.
  const documentacionAprobada = propertyRow.legal_status === 'approved'
  // El abogado solo se nombra si REALMENTE aprobó: `legal_reviewer_id` también
  // queda escrito cuando rechazó.
  const lawyer = documentacionAprobada && propertyRow.legal_reviewer_id
    ? await getUserById(propertyRow.legal_reviewer_id)
    : null
  const lawyerName = lawyer?.full_name || null
  const advisorName = asesor?.full_name || 'Asesor'
  const copy = copyCaptacion({ documentacionAprobada, nombreAbogado: lawyerName, direccion: propertyRow.address })

  // La fecha de captación es `captured_at` (el momento real). `legal_reviewed_at`
  // solo sirve como fecha de captación cuando la revisión legal fue lo que la
  // completó; si no hubo revisión, esa columna está vacía o habla de otra cosa.
  const fechaCaptacion = propertyRow.captured_at
    || (documentacionAprobada ? propertyRow.legal_reviewed_at : null)
    || propertyRow.updated_at
    || new Date().toISOString()
  const capturedAt = formatDate(fechaCaptacion)

  // Days from deal creation to capture (informative KPI). linkedDeal viene del
  // stakeholders helper — evita segundo query a deals.
  let daysFromDealToCapture: number | null = null
  if (linkedDeal?.created_at) {
    const start = new Date(linkedDeal.created_at).getTime()
    const end = new Date(fechaCaptacion).getTime()
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
    const testA = await applyTestMode([asesor.email], copy.asuntoAsesor)
    const htmlA = await renderEmail(
      CongratulationsAsesorEmail({
        advisorFirstName: firstName(asesor.full_name) || 'equipo',
        lawyerName,
        documentacionAprobada,
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
      subject: copy.asuntoAsesor,
      html: htmlA,
    })
  }

  // === 8B — a coordinador + admins+dueños ===
  const adminsTo = dedupEmails(
    coordinador?.email ? [coordinador.email] : [],
    emailsOf(adminsOwners),
  )
  if (adminsTo.length > 0) {
    const testB = await applyTestMode(adminsTo, copy.asuntoEquipo(advisorName))
    const htmlB = await renderEmail(
      PropertyCapturedEmail({
        advisorName,
        lawyerName,
        documentacionAprobada,
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
      subject: copy.asuntoEquipo(advisorName),
      html: htmlB,
    })
  }
}
