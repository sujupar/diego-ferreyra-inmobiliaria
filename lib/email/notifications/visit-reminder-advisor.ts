import 'server-only'
import { sendEmail, type SendEmailResult } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { formatearFechaLarga } from '@/lib/visitas/horario'
import VisitReminderAdvisorEmail from '@/emails/VisitReminderAdvisorEmail'

/**
 * Email "¿Se realizó la visita?" al asesor (spec §4.7). No lee la base: los datos los trae
 * la ruta del cron (con clave de servicio). Devuelve el resultado de `sendEmail`, que
 * NUNCA lanza: quien llama tiene que mirar `ok`/`failed`/`sent` (CLAUDE.md § cola durable:
 * un `ok:false` con `failed:0` es "falta RESEND_API_KEY" y también es un fallo).
 *
 * `idempotent: false` a propósito: si la visita se reprograma, el trigger vuelve
 * `reminder_sent_at` a NULL y el aviso tiene que poder salir de nuevo por la MISMA visita.
 * El "una sola vez" lo garantiza la reserva atómica de `reminder_sent_at` en la ruta.
 * `entityType: 'property'` es el que ya usaba este aviso (el log no tiene tipo "visita").
 */
function urlDeLaApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar').replace(/\/+$/, '')
}

export interface DatosRecordatorio {
  visitaId: string
  scheduledAt: string
  cliente: string
  direccion: string | null
  asesor: { nombre: string; email: string }
}

export async function enviarRecordatorioDeVisita(d: DatosRecordatorio): Promise<SendEmailResult> {
  const direccion = d.direccion?.trim() || 'la propiedad'
  const html = await renderEmail(VisitReminderAdvisorEmail({
    advisorName: d.asesor.nombre,
    propertyAddress: direccion,
    clientName: d.cliente.trim() || 'la persona',
    scheduledAt: formatearFechaLarga(d.scheduledAt),
    visitUrl: `${urlDeLaApp()}/visits/${d.visitaId}`,
  }))
  return sendEmail({
    notificationType: 'visit_reminder_advisor',
    entityType: 'property',
    entityId: d.visitaId,
    to: d.asesor.email,
    subject: `¿Se realizó la visita? ${direccion}`,
    html,
    idempotent: false,
  })
}
