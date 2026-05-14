import 'server-only'
import { cookies } from 'next/headers'
import { sendEmail } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { createClient } from '@/lib/supabase/server'
import VisitScheduledClientEmail from '@/emails/VisitScheduledClientEmail'

function formatES(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export async function sendVisitScheduledToClient(visitId: string) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: visit } = await supabase
    .from('property_visits')
    .select(`
      id, client_name, client_email, scheduled_at,
      property:properties(address, neighborhood),
      advisor:profiles!property_visits_advisor_id_fkey(full_name, email, phone)
    `)
    .eq('id', visitId)
    .maybeSingle()

  if (!visit || !visit.client_email) {
    console.warn('[visit-scheduled-client] missing visit or client_email', visitId)
    return
  }

  // Supabase types nested joins as arrays-of-1 by default; normalize.
  const property = Array.isArray(visit.property) ? visit.property[0] : visit.property
  const advisor = Array.isArray(visit.advisor) ? visit.advisor[0] : visit.advisor

  const html = await renderEmail(
    VisitScheduledClientEmail({
      clientName: visit.client_name,
      propertyAddress: property?.address ?? '',
      propertyNeighborhood: property?.neighborhood ?? '',
      scheduledAt: formatES(visit.scheduled_at),
      advisorName: advisor?.full_name ?? 'Tu asesor',
      advisorPhone: advisor?.phone ?? undefined,
      advisorEmail: advisor?.email ?? 'contacto@inmodf.com.ar',
    })
  )

  await sendEmail({
    notificationType: 'visit_scheduled_client',
    entityType: 'property',
    entityId: visit.id,
    to: visit.client_email,
    subject: `Confirmación de visita: ${property?.address ?? ''}`,
    html,
    idempotent: true,
  })
}
