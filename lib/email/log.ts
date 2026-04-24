import 'server-only'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface LogInput {
  notificationType: string
  entityType?: string
  entityId?: string
  recipient: string
  originalRecipient?: string
  subject: string
  status: 'sent' | 'failed' | 'skipped_idempotent'
  testMode: boolean
  errorMessage?: string
  resendId?: string
}

/**
 * Insert a log entry. Fire-and-forget friendly: errors are swallowed and
 * logged to the console — we never want a DB write failure to take down
 * the caller's main flow.
 */
export async function logNotification(input: LogInput) {
  try {
    const { error } = await getAdmin().from('email_notifications_log').insert({
      notification_type: input.notificationType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      recipient_email: input.recipient,
      original_recipient_email: input.originalRecipient ?? null,
      subject: input.subject,
      status: input.status,
      test_mode: input.testMode,
      error_message: input.errorMessage ?? null,
      resend_email_id: input.resendId ?? null,
    })
    if (error) console.error('[email-log] insert failed:', error.message)
  } catch (err) {
    console.error('[email-log] unexpected:', err)
  }
}

/**
 * True if `(notificationType, entityId, recipient)` already has a 'sent' row.
 * Called before sending to skip duplicates under the UNIQUE INDEX. Per-recipient
 * granularity lets us retry destinatarios that failed without re-sending to
 * destinatarios that already received.
 */
export async function alreadySentToRecipient(notificationType: string, entityId: string, recipient: string): Promise<boolean> {
  const { count, error } = await getAdmin()
    .from('email_notifications_log')
    .select('id', { count: 'exact', head: true })
    .eq('notification_type', notificationType)
    .eq('entity_id', entityId)
    .eq('recipient_email', recipient)
    .eq('status', 'sent')
  if (error) {
    console.error('[email-log] alreadySent check failed:', error.message)
    return false  // fail-open: better to risk a duplicate than to skip a legit send
  }
  return (count ?? 0) > 0
}
