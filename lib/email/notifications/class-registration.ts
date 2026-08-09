import 'server-only'
import { sendEmail, type SendEmailResult } from '../resend-client'
import { renderEmail } from '../render'
import { getDealStakeholders, dedupEmails, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { ClassRegistrationAdminsEmail } from '@/emails/ClassRegistrationAdminsEmail'
import { formatDateTime } from '../format'

export interface NotifyClassRegistrationOptions {
  dealId: string
  formName?: string | null
}

/**
 * Notifica a coordinador + admins + dueños que un contacto se registró a la
 * clase gratuita. NO se notifica al asesor (no aplica: aún no hay tasación) y
 * el copy aclara explícitamente que esto NO es una solicitud de tasación —
 * evita contaminar la métrica de solicitudes en el inbox del equipo.
 *
 * DEVUELVE el resultado del envío por el mismo motivo que `notifyAppraisalRequest`
 * (ver el comentario largo de ese módulo): `sendEmail` no tira, así que ignorar
 * lo que contesta convierte un fallo de Resend en un "listo, avisado". `null` =
 * no había nada que enviar.
 */
export async function notifyClassRegistration(
  { dealId, formName }: NotifyClassRegistrationOptions,
): Promise<SendEmailResult | null> {
  const { coordinador, adminsOwners, contact, dealRow } = await getDealStakeholders(dealId)
  if (!dealRow) return null

  if (dealRow.origin !== 'clase_gratuita') {
    throw new Error(`notifyClassRegistration called for deal ${dealId} with origin="${dealRow.origin}" (expected "clase_gratuita")`)
  }

  const recipients = dedupEmails(
    coordinador?.email ? [coordinador.email] : [],
    emailsOf(adminsOwners),
  )
  if (recipients.length === 0) return null

  const subject = `Nuevo registro a clase gratuita: ${contact?.full_name || 'lead sin nombre'}`
  const testCtx = await applyTestMode(recipients, subject)

  const html = await renderEmail(
    ClassRegistrationAdminsEmail({
      contactName: contact?.full_name || 'Sin nombre',
      contactEmail: contact?.email || null,
      contactPhone: contact?.phone || null,
      registeredAt: formatDateTime(dealRow.created_at),
      formName: formName ?? null,
      dealId,
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
    }) as any
  )

  return sendEmail({
    notificationType: 'class_registration_admins',
    entityType: 'deal',
    entityId: dealId,
    to: recipients,
    subject,
    html,
  })
}
