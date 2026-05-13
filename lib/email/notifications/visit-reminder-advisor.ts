import 'server-only'
import { cookies } from 'next/headers'
import { sendEmail } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { createClient } from '@/lib/supabase/server'
import VisitReminderAdvisorEmail from '@/emails/VisitReminderAdvisorEmail'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.inmodf.com.ar'

export async function sendReminderForVisit(visitId: string) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: v } = await supabase
    .from('property_visits')
    .select(`
      id, scheduled_at, client_name, reminder_sent_at,
      property:properties(address),
      advisor:profiles!property_visits_advisor_id_fkey(id, full_name, email)
    `)
    .eq('id', visitId)
    .maybeSingle()

  if (!v) return
  const advisor = Array.isArray(v.advisor) ? v.advisor[0] : v.advisor
  const property = Array.isArray(v.property) ? v.property[0] : v.property
  if (!advisor?.email) return
  if (v.reminder_sent_at) return

  const html = await renderEmail(
    VisitReminderAdvisorEmail({
      advisorName: advisor.full_name,
      propertyAddress: property?.address ?? '',
      clientName: v.client_name,
      scheduledAt: new Date(v.scheduled_at).toLocaleString('es-AR'),
      visitUrl: `${APP_URL}/visits/${v.id}`,
    })
  )

  await sendEmail({
    notificationType: 'visit_reminder_advisor',
    entityType: 'property',
    entityId: v.id,
    to: advisor.email,
    subject: `¿Se realizó la visita? ${property?.address ?? ''}`,
    html,
    idempotent: true,
  })

  await supabase.from('property_visits').update({ reminder_sent_at: new Date().toISOString() }).eq('id', v.id)
}
