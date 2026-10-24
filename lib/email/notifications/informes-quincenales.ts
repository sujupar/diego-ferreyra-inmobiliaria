import 'server-only'
/**
 * Email a la coordinación: los informes del ciclo están listos para completar (spec del informe quincenal,
 * "Qué pasa por detrás" punto 5). UNO por tanda. No hace falta `idempotent`: el cron reclama cada informe con
 * `avisado_at` antes de llamar acá, así que una tanda nunca se avisa dos veces. `sendEmail` NUNCA lanza.
 */
import { sendEmail, type SendEmailResult } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { getEmailsByRole } from '@/lib/email/recipients'
import InformesQuincenalesEmail from '@/emails/InformesQuincenalesEmail'

/** Varios destinatarios en serie dentro del cron (techo de Netlify ~26 s). */
export const TECHO_POR_DESTINATARIO_MS = 4_000

function urlDeLaApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://inmodf.com.ar').replace(/\/+$/, '')
}

export async function notificarInformesQuincenales(d: {
  periodo: string
  informes: Array<{ id: string; direccion: string }>
}): Promise<SendEmailResult | null> {
  if (!d.informes.length) return null
  const to = await getEmailsByRole('coordinador')
  if (!to.length) return null
  const base = urlDeLaApp()
  const html = await renderEmail(InformesQuincenalesEmail({
    periodo: d.periodo,
    informes: d.informes.map(i => ({ direccion: i.direccion, url: `${base}/informes/${i.id}` })),
    listadoUrl: `${base}/informes`,
  }))
  const cuantos = d.informes.length
  return sendEmail({
    notificationType: 'informes_quincenales',
    entityType: 'property',
    entityId: d.informes[0].id,
    to,
    subject: cuantos === 1 ? `Informe quincenal listo para completar: ${d.informes[0].direccion}` : `${cuantos} informes quincenales listos para completar`,
    html,
    idempotent: false,
    timeoutMs: TECHO_POR_DESTINATARIO_MS,
  })
}
