import 'server-only'
/**
 * Email al equipo cuando alguien completa la encuesta (spec §4.10): asesor de la visita +
 * coordinadores + admins/dueños. Lo dispara el canal "equipo" de los avisos
 * (lib/visitas/encuesta/avisos-servicio.ts), fuera del pedido final de la encuesta.
 *
 * `idempotent: true`: es UNA encuesta por visita, así que un reintento (por un destinatario que
 * falló) no le repite el email a los que ya lo recibieron. Techo de 3 s por destinatario (no 8):
 * son varios en serie y el pedido entero tiene que caber en Netlify (ver avisos.ts).
 * Devuelve `null` si no hay nadie activo a quien avisar. `sendEmail` NUNCA lanza.
 */
import { sendEmail, type SendEmailResult } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { getUserById, getEmailsByRole, getAdminsAndOwners, dedupEmails, emailsOf } from '@/lib/email/recipients'
import { formatearFechaLarga } from '@/lib/visitas/horario'
import { filasDeRespuestas, type RespuestasParaFicha } from '@/lib/visitas/encuesta/ficha'
import VisitSurveyAnsweredEmail from '@/emails/VisitSurveyAnsweredEmail'

export const TECHO_POR_DESTINATARIO_MS = 3_000

export interface DatosEncuestaRespondida {
  visitaId: string
  asesorId: string | null
  direccion: string
  persona: string
  scheduledAt: string
  respuestas: RespuestasParaFicha
}

function urlDeLaApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://inmodf.com.ar').replace(/\/+$/, '')
}

export async function notificarEncuestaRespondida(d: DatosEncuestaRespondida): Promise<SendEmailResult | null> {
  const [asesor, coordinadores, admins] = await Promise.all([
    getUserById(d.asesorId), getEmailsByRole('coordinador'), getAdminsAndOwners(),
  ])
  const to = dedupEmails(asesor ? [asesor.email] : [], coordinadores, emailsOf(admins))
  if (to.length === 0) return null
  const html = await renderEmail(VisitSurveyAnsweredEmail({
    direccion: d.direccion,
    persona: d.persona.trim() || 'La persona',
    fechaVisita: formatearFechaLarga(d.scheduledAt),
    filas: filasDeRespuestas(d.respuestas),
    visitaUrl: `${urlDeLaApp()}/visits/${d.visitaId}`,
  }))
  return sendEmail({
    notificationType: 'visit_survey_answered',
    entityType: 'property',
    entityId: d.visitaId,
    to,
    subject: `Respondieron la encuesta: ${d.direccion}`,
    html,
    idempotent: true,
    timeoutMs: TECHO_POR_DESTINATARIO_MS,
  })
}
