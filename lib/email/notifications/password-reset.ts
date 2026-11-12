import 'server-only'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { PasswordResetEmail } from '@/emails/PasswordResetEmail'

export const TIPO_NOTIFICACION_RESET = 'password_reset'
export const ASUNTO_RESET = 'Restablecé tu contraseña — Diego Ferreyra Inmobiliaria'

const FROM = process.env.EMAIL_FROM_DEFAULT
  ?? 'Diego Ferreyra Inmobiliaria <notificaciones@inmodf.com.ar>'

export interface NotifyPasswordResetOptions {
  userId: string
  email: string
  nombre: string | null
  enlace: string
  venceEnMinutos: number
}

export async function notifyPasswordReset(opts: NotifyPasswordResetOptions) {
  const html = await renderEmail(
    PasswordResetEmail({ nombre: opts.nombre, enlace: opts.enlace, venceEnMinutos: opts.venceEnMinutos }),
  )
  return sendEmail({
    notificationType: TIPO_NOTIFICACION_RESET,
    entityType: 'user',
    // Cada pedido es un envío distinto: con un id fijo la idempotencia frenaría el
    // segundo enlace de alguien que borró el primero sin querer.
    entityId: `reset:${opts.userId}:${Date.now()}`,
    to: opts.email,
    from: FROM,
    subject: ASUNTO_RESET,
    html,
    idempotent: false,
    ignorarModoPrueba: true,
  })
}
