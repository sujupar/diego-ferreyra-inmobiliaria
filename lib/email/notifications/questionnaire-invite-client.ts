import 'server-only'
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import QuestionnaireInviteClientEmail from '@/emails/QuestionnaireInviteClientEmail'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.inmodf.com.ar'

export async function sendQuestionnaireInvite(visitId: string) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: v } = await supabase
    .from('property_visits')
    .select(`
      id, client_name, client_email,
      property:properties(address),
      advisor:profiles!property_visits_advisor_id_fkey(full_name)
    `)
    .eq('id', visitId)
    .maybeSingle()

  if (!v || !v.client_email) throw new Error('Visit or client_email missing')

  const property = Array.isArray(v.property) ? v.property[0] : v.property
  const advisor = Array.isArray(v.advisor) ? v.advisor[0] : v.advisor

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: tErr } = await (supabase as any)
    .from('visit_questionnaire_tokens')
    .insert({ visit_id: visitId, token, expires_at: expiresAt, sent_to: v.client_email })
  if (tErr) throw tErr

  const url = `${APP_URL}/questionnaire/${token}`
  const html = await renderEmail(
    QuestionnaireInviteClientEmail({
      clientName: v.client_name,
      propertyAddress: property?.address ?? '',
      questionnaireUrl: url,
      advisorName: advisor?.full_name ?? 'Tu asesor',
    })
  )

  await sendEmail({
    notificationType: 'questionnaire_invite_client',
    entityType: 'property',
    entityId: visitId,
    to: v.client_email,
    subject: `Tu opinión sobre ${property?.address ?? 'la propiedad visitada'}`,
    html,
    idempotent: false,
  })

  return { token, url }
}
