import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { applyTestMode } from '../test-mode'
import { InvitationEmail } from '@/emails/InvitationEmail'

export interface NotifyInvitationOptions {
  inviteeEmail: string
  roleLabel: string
  inviterName: string
  inviterEmail?: string | null
  acceptUrl: string
  expiresInDays: number
}

const FROM = process.env.EMAIL_FROM_INVITATIONS
  ?? 'Diego Ferreyra Inmobiliaria <invitaciones@inmodf.com.ar>'

export async function notifyInvitation(opts: NotifyInvitationOptions) {
  const testCtx = await applyTestMode([opts.inviteeEmail], `Te invitaron a Diego Ferreyra Inmobiliaria (${opts.roleLabel})`)
  const html = await renderEmail(
    InvitationEmail({
      inviteeEmail: opts.inviteeEmail,
      roleLabel: opts.roleLabel,
      inviterName: opts.inviterName,
      acceptUrl: opts.acceptUrl,
      expiresInDays: opts.expiresInDays,
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
    }) as any
  )
  return sendEmail({
    notificationType: 'user_invitation',
    entityType: 'user',
    entityId: `invite:${opts.inviteeEmail.toLowerCase()}:${Date.now()}`,
    to: opts.inviteeEmail,
    from: FROM,
    replyTo: opts.inviterEmail ?? undefined,
    subject: `Te invitaron a Diego Ferreyra Inmobiliaria (${opts.roleLabel})`,
    html,
    idempotent: false,
  })
}
