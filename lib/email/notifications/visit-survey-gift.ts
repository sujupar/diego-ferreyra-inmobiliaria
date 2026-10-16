import 'server-only'
/**
 * Email con el regalo para la persona que completó la encuesta y dejó su email (adenda §11.1.4b).
 * El link apunta a NUESTRA ruta de descarga, que firma una URL nueva cada vez: el email sirve
 * aunque pasen días (una URL firmada pegada en el email vencería en 10 minutos).
 * Idempotente por encuesta: un reintento no le repite el email. `sendEmail` NUNCA lanza.
 */
import { sendEmail, type SendEmailResult } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import VisitSurveyGiftEmail from '@/emails/VisitSurveyGiftEmail'

export interface DatosRegaloPorEmail {
  encuestaId: string
  email: string
  nombre: string
  direccion: string
  titulo: string
  urlDescarga: string
}

export async function enviarRegaloPorEmail(d: DatosRegaloPorEmail): Promise<SendEmailResult> {
  const html = await renderEmail(VisitSurveyGiftEmail({ nombre: d.nombre, direccion: d.direccion, titulo: d.titulo, urlDescarga: d.urlDescarga }))
  return sendEmail({
    notificationType: 'visit_survey_gift_client',
    entityType: 'property',
    entityId: d.encuestaId,
    to: d.email,
    subject: `Tu material de ${d.direccion}`,
    html,
  })
}
