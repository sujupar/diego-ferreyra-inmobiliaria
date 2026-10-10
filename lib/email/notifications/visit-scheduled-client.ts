import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { formatearFechaLarga } from '@/lib/visitas/horario'
import VisitScheduledClientEmail from '@/emails/VisitScheduledClientEmail'

/**
 * "Tu visita está confirmada" para la persona que va a visitar.
 *
 * Hora: `formatearFechaLarga` la escribe en horario argentino. Antes usaba
 * `toLocaleString` sin zona y en el servidor (UTC) la hora salía 3 h corrida.
 * Lectura con service role: desde 2026-10-10 la lectura con sesión depende de la
 * RLS por asesor, y este envío ocurre en la misma solicitud que creó la visita.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function sendVisitScheduledToClient(visitId: string) {
  const { data: visit } = await admin()
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

  // Supabase tipa los joins como arreglos de 1: se normaliza.
  const property = Array.isArray(visit.property) ? visit.property[0] : visit.property
  const advisor = Array.isArray(visit.advisor) ? visit.advisor[0] : visit.advisor

  const html = await renderEmail(
    VisitScheduledClientEmail({
      clientName: visit.client_name,
      propertyAddress: property?.address ?? '',
      propertyNeighborhood: property?.neighborhood ?? '',
      scheduledAt: formatearFechaLarga(visit.scheduled_at),
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
