import 'server-only'
import { notifyAdminEmailFailure } from './notifications/admin-failure-alert'

/**
 * Wrap a notification call so that if it fails, we escalate to admins via
 * notifyAdminEmailFailure(). The escalation itself is also wrapped — if it
 * also fails we just log; we never throw.
 *
 * Use this for transactional notifications where silent failure means a real
 * person doesn't get told something they need to know.
 */
export async function notifyWithEscalation(
    operation: () => Promise<unknown>,
    context: {
        failedNotificationType: string
        entityType: string
        entityId: string
    }
): Promise<{ ok: boolean; error?: string }> {
    try {
        await operation()
        return { ok: true }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[notify] ${context.failedNotificationType} failed:`, message)

        try {
            await notifyAdminEmailFailure({
                failedNotificationType: context.failedNotificationType,
                entityType: context.entityType,
                entityId: context.entityId,
                errors: [message],
            })
        } catch (alertErr) {
            // No recurrencia: si la alerta también falla, solo log.
            console.error(`[notify] admin-failure-alert recurrent failure for ${context.failedNotificationType}:`, alertErr)
        }

        return { ok: false, error: message }
    }
}
