import 'server-only'
import { Resend } from 'resend'
import { applyTestMode } from './test-mode'
import { logNotification, alreadySentToRecipient } from './log'

let client: Resend | null = null
function getClient(): Resend | null {
  if (client) return client
  if (!process.env.RESEND_API_KEY) return null
  client = new Resend(process.env.RESEND_API_KEY)
  return client
}

const DEFAULT_FROM = process.env.EMAIL_FROM_DEFAULT
  ?? 'Diego Ferreyra Inmobiliaria <notificaciones@inmodf.com.ar>'
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO
  ?? 'contacto.julianparra@gmail.com'

export interface SendEmailInput {
  notificationType: string
  entityType?: 'deal' | 'property' | 'appraisal' | 'user'
  entityId?: string
  to: string | string[]
  from?: string
  replyTo?: string
  subject: string
  html: string
  attachments?: { filename: string; content: Buffer }[]
  /**
   * When true (default) skips destinatarios that already received this
   * (notificationType, entityId) pair. Set false for repeatable events
   * (doc rechazado, resubmitted, etc.).
   */
  idempotent?: boolean
}

export interface SendEmailResult {
  ok: boolean
  sent: number
  skipped: number
  failed: number
  errors: string[]
}

/**
 * Central email sender. Applies test-mode redirection, per-recipient
 * idempotency, and structured logging. Never throws — errors are logged
 * and returned in the result so callers can stay fire-and-forget.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const result: SendEmailResult = { ok: true, sent: 0, skipped: 0, failed: 0, errors: [] }
  const resend = getClient()
  const idempotent = input.idempotent !== false

  // Ruidoso en vez de silencioso: si la API key no está seteada (ej. durante
  // propagación DNS los primeros días), logueamos y devolvemos ok=false en
  // lugar de lanzar. El caller puede decidir si escalar.
  if (!resend) {
    const msg = 'RESEND_API_KEY not set; skipping email send'
    console.error(`[resend] ${msg} — type=${input.notificationType} entity=${input.entityId ?? '-'}`)
    result.ok = false
    result.errors.push(msg)
    return result
  }

  const { to, subject, testModeOn, originalTo } = await applyTestMode(input.to, input.subject)

  for (const recipient of to) {
    // Idempotency check per recipient.
    if (idempotent && input.entityId) {
      try {
        if (await alreadySentToRecipient(input.notificationType, input.entityId, recipient)) {
          await logNotification({
            notificationType: input.notificationType,
            entityType: input.entityType,
            entityId: input.entityId,
            recipient,
            originalRecipient: originalTo.join(','),
            subject,
            status: 'skipped_idempotent',
            testMode: testModeOn,
          })
          result.skipped++
          continue
        }
      } catch (err) {
        console.error('[resend] idempotency check failed, proceeding with send:', err)
      }
    }

    try {
      const { data, error } = await resend.emails.send({
        from: input.from ?? DEFAULT_FROM,
        to: recipient,
        replyTo: input.replyTo ?? DEFAULT_REPLY_TO,
        subject,
        html: input.html,
        attachments: input.attachments,
      })
      if (error) throw new Error(error.message)
      await logNotification({
        notificationType: input.notificationType,
        entityType: input.entityType,
        entityId: input.entityId,
        recipient,
        originalRecipient: originalTo.join(','),
        subject,
        status: 'sent',
        testMode: testModeOn,
        resendId: data?.id,
      })
      result.sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[resend] send failed to ${recipient}: ${msg}`)
      await logNotification({
        notificationType: input.notificationType,
        entityType: input.entityType,
        entityId: input.entityId,
        recipient,
        originalRecipient: originalTo.join(','),
        subject,
        status: 'failed',
        testMode: testModeOn,
        errorMessage: msg,
      })
      result.failed++
      result.errors.push(msg)
      result.ok = false
    }
  }

  return result
}
