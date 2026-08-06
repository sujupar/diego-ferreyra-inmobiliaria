import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getDealStakeholders, dedupEmails, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { AppraisalRequestAdminsEmail } from '@/emails/AppraisalRequestAdminsEmail'
import { formatDateTime } from '../format'
import { isPlaceholderAddress } from '@/lib/funnel/placeholder'

export interface NotifyAppraisalRequestOptions {
  dealId: string
}

/**
 * Notifica a coordinador + admins + dueños que alguien SOLICITÓ una tasación
 * desde la campaña (registro de la landing) — NO que haya una tasación agendada.
 *
 * Por qué existe (2026-07-30): el registro del embudo usaba `notifyDealCreated`,
 * cuyo subject dice "Tasación agendada" y cuya pieza muestra Barrio/Fecha/Hora/
 * Tipo/Asesor. Un registro no tiene NADA de eso todavía → el email llegaba con
 * todos los campos vacíos afirmando algo falso. Mismo criterio (y mismo patrón)
 * que `notifyClassRegistration`.
 *
 * NO se notifica al asesor: en una solicitud recién entrada todavía no hay
 * asesor asignado. El asesor se entera cuando el coordinador agenda la visita
 * (ahí sí dispara `notifyDealCreated`, intacto).
 */
export async function notifyAppraisalRequest({ dealId }: NotifyAppraisalRequestOptions) {
  const { coordinador, adminsOwners, contact, dealRow } = await getDealStakeholders(dealId)
  if (!dealRow) return

  if (dealRow.origin !== 'embudo') {
    throw new Error(`notifyAppraisalRequest called for deal ${dealId} with origin="${dealRow.origin}" (expected "embudo")`)
  }

  const recipients = dedupEmails(
    coordinador?.email ? [coordinador.email] : [],
    emailsOf(adminsOwners),
  )
  if (recipients.length === 0) return

  const contactName = contact?.full_name || 'Lead sin nombre'

  // `property_address` es NOT NULL: cuando el interesado no deja la ubicación,
  // createFunnelLead guarda un placeholder ("Solicitud de tasación — {nombre}" o
  // "Clase Gratuita — {nombre}"). Mostrarlo como si fuera una dirección real
  // confundiría, así que lo tratamos como "no la dejó" (la plantilla imprime el
  // texto correspondiente). `isPlaceholderAddress` vive en un módulo compartido
  // con `createFunnelLead` para que ninguno de los dos lados se desincronice.
  const rawAddress = dealRow.property_address ?? ''
  const propertyLocation = isPlaceholderAddress(rawAddress) ? null : rawAddress || null

  const subject = `Nueva solicitud de tasación: ${contactName}`
  const testCtx = await applyTestMode(recipients, subject)

  const html = await renderEmail(
    AppraisalRequestAdminsEmail({
      contactName,
      contactEmail: contact?.email || null,
      contactPhone: contact?.phone || null,
      propertyLocation,
      message: dealRow.notes || null,
      requestedAt: formatDateTime(dealRow.created_at),
      campaignName: (dealRow as { meta_campaign_name?: string | null }).meta_campaign_name || null,
      dealId,
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
    }) as any
  )

  await sendEmail({
    notificationType: 'appraisal_request_admins',
    entityType: 'deal',
    entityId: dealId,
    to: recipients,
    subject,
    html,
  })
}
