import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getDealStakeholders, dedupEmails, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { DealCreatedAdvisorEmail } from '@/emails/DealCreatedAdvisorEmail'
import { DealCreatedAdminsEmail } from '@/emails/DealCreatedAdminsEmail'
import { firstName, formatDate, propertyTypeLabel } from '../format'

export interface NotifyDealCreatedOptions {
  dealId: string
}

/**
 * Disparar las 2 variantes del email de "deal creado":
 *   A — al asesor asignado.
 *   B — a coordinador + admins+dueños (el coordinador que agendó también recibe
 *       aunque no sea admin, para tener confirmación de su propia acción).
 * Dedupa: si el asesor también es admin/dueño, no recibe B (ya recibió A).
 */
export async function notifyDealCreated({ dealId }: NotifyDealCreatedOptions) {
  const { asesor, coordinador, adminsOwners, contact, dealRow } = await getDealStakeholders(dealId)
  if (!dealRow) return

  const coordinadorName = coordinador?.full_name || 'Coordinador'
  const advisorName = asesor?.full_name || null
  const propertyTypeLbl = propertyTypeLabel(dealRow.property_type, dealRow.property_type_other)

  // === Variante A: al asesor ===
  if (asesor?.email) {
    const originalAdvisorRecipients = [asesor.email]
    const aTestCtx = await applyTestMode(originalAdvisorRecipients, 'Nueva tasación asignada')
    const aHtml = await renderEmail(
      DealCreatedAdvisorEmail({
        advisorFirstName: firstName(asesor.full_name) || 'equipo',
        coordinadorName,
        dealId,
        propertyAddress: dealRow.property_address,
        neighborhood: dealRow.neighborhood,
        scheduledDate: formatDate(dealRow.scheduled_date),
        scheduledTime: dealRow.scheduled_time,
        propertyType: propertyTypeLbl,
        origin: dealRow.origin,
        contactName: contact?.full_name || 'Contacto',
        contactPhone: contact?.phone || null,
        contactEmail: contact?.email || null,
        notes: dealRow.notes || null,
        testMode: aTestCtx.testModeOn,
        originalRecipients: aTestCtx.originalTo,
      }) as any
    )
    await sendEmail({
      notificationType: 'deal_created_advisor',
      entityType: 'deal',
      entityId: dealId,
      to: asesor.email,
      subject: `Nueva tasación asignada — ${dealRow.property_address}`,
      html: aHtml,
    })
  }

  // === Variante B: a coordinador + admins + dueños ===
  // El coordinador recibe confirmación de su acción (con subject informativo en
  // vez del asignado al asesor). Admins/dueños reciben la misma pieza.
  // Dedup: si el asesor también está en la lista (porque es admin/dueño) se
  // filtra — ya recibió A. dedupEmails además deduplica coordinador si resulta
  // ser también admin.
  const adminEmails = dedupEmails(
    coordinador?.email ? [coordinador.email] : [],
    emailsOf(adminsOwners),
  )
  const filteredAdminEmails = asesor?.email
    ? adminEmails.filter(e => e.toLowerCase() !== asesor.email!.toLowerCase())
    : adminEmails

  if (filteredAdminEmails.length > 0) {
    const bTestCtx = await applyTestMode(filteredAdminEmails, 'Tasación agendada')
    const bHtml = await renderEmail(
      DealCreatedAdminsEmail({
        coordinadorName,
        advisorName,
        dealId,
        propertyAddress: dealRow.property_address,
        neighborhood: dealRow.neighborhood,
        scheduledDate: formatDate(dealRow.scheduled_date),
        scheduledTime: dealRow.scheduled_time,
        propertyType: propertyTypeLbl,
        origin: dealRow.origin,
        testMode: bTestCtx.testModeOn,
        originalRecipients: bTestCtx.originalTo,
      }) as any
    )
    await sendEmail({
      notificationType: 'deal_created_admins',
      entityType: 'deal',
      entityId: dealId,
      to: filteredAdminEmails,
      subject: `Tasación agendada: ${dealRow.property_address}${advisorName ? ` — asesor ${advisorName}` : ''}`,
      html: bHtml,
    })
  }
}
