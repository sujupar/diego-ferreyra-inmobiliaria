import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getAdminsAndOwners, emailsOf } from '../recipients'
import { getNotificationSettings } from '../settings'
import { AdminFailureAlertEmail } from '@/emails/AdminFailureAlertEmail'

/**
 * Emergencia: cuando un email crítico al abogado falla, alertar a admins para
 * que puedan intervenir manualmente. NUNCA hace retry ni auto-alerta para evitar
 * bucles infinitos.
 */
export async function notifyAdminEmailFailure(params: {
  failedNotificationType: string
  entityType: string
  entityId: string
  errors: string[]
}) {
  const settings = await getNotificationSettings()
  if (!settings.alert_admins_on_lawyer_failure) return

  const admins = await getAdminsAndOwners()
  const to = emailsOf(admins)
  if (to.length === 0) return

  const html = await renderEmail(
    AdminFailureAlertEmail({
      failedNotificationType: params.failedNotificationType,
      entityType: params.entityType,
      entityId: params.entityId,
      errors: params.errors,
    }) as any
  )
  await sendEmail({
    notificationType: 'admin_failure_alert',
    entityType: 'user',
    entityId: `alert:${params.failedNotificationType}:${params.entityId}:${Date.now()}`,
    to,
    subject: `[URGENTE] Falló notificación de ${params.failedNotificationType}`,
    html,
    idempotent: false,
  })
}
