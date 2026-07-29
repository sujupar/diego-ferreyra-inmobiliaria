import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '../resend-client'
import { renderEmail } from '../render'
import { getAdminsAndOwners, getEmailsByRole, getUserById, dedupEmails, emailsOf } from '../recipients'
import { applyTestMode } from '../test-mode'
import { VisitProposedEmail } from '@/emails/VisitProposedEmail'

/**
 * Aviso de VISITA PROPUESTA por un cliente desde el recorrido (`/v/[token]`).
 * Destinatarios: asesor asignado + coordinadores + dueños/admins (supervisión).
 * Usa el cliente service-role: se dispara desde una ruta pública sin sesión.
 * Best-effort: nunca lanza — la visita ya está registrada cuando esto corre.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const FRANJA_LABEL: Record<string, string> = {
  manana: 'Mañana',
  mediodia: 'Mediodía',
  tarde: 'Tarde',
}

/** Deriva la etiqueta de franja a partir de la hora (AR) por si el texto de notes cambia. */
function franjaLabelFromDate(date: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('es-AR', { hour: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(date)
  )
  if (hour <= 10) return FRANJA_LABEL.manana
  if (hour <= 13) return FRANJA_LABEL.mediodia
  return FRANJA_LABEL.tarde
}

export async function notifyVisitProposed(visitId: string): Promise<void> {
  const sb = admin()
  const { data: visit } = await sb
    .from('property_visits')
    .select('id, client_name, client_email, client_phone, scheduled_at, notes, property_id, advisor_id')
    .eq('id', visitId)
    .maybeSingle()
  if (!visit) return
  const v = visit as {
    id: string
    client_name: string
    client_email: string | null
    client_phone: string | null
    scheduled_at: string
    notes: string | null
    property_id: string
    advisor_id: string | null
  }

  const { data: prop } = await sb
    .from('properties')
    .select('address, neighborhood')
    .eq('id', v.property_id)
    .maybeSingle()
  const p = prop as { address?: string | null; neighborhood?: string | null } | null
  const propertyAddress = p?.address || 'la propiedad'

  // Asesor asignado + coordinadores + dueños/admins (supervisión).
  const [coordinadores, adminsOwners, advisor] = await Promise.all([
    getEmailsByRole('coordinador'),
    getAdminsAndOwners(),
    getUserById(v.advisor_id),
  ])
  const to = dedupEmails(coordinadores, emailsOf(adminsOwners), advisor?.email ? [advisor.email] : [])
  if (to.length === 0) return

  const scheduledAtDate = new Date(v.scheduled_at)
  const scheduledAtLabel = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(scheduledAtDate)
  const franjaLabel = franjaLabelFromDate(scheduledAtDate)

  const subject = `Visita propuesta: ${propertyAddress} — ${v.client_name}`
  const testCtx = await applyTestMode(to, subject)
  const html = await renderEmail(
    VisitProposedEmail({
      clientName: v.client_name,
      propertyId: v.property_id,
      propertyAddress,
      neighborhood: p?.neighborhood ?? null,
      clientPhone: v.client_phone,
      clientEmail: v.client_email,
      scheduledAtLabel,
      franjaLabel,
      testMode: testCtx.testModeOn,
      originalRecipients: testCtx.originalTo,
      recipientRole: 'parte del equipo',
    }) as any
  )

  await sendEmail({
    notificationType: 'visit_proposed',
    entityType: 'property',
    entityId: v.id,
    to,
    subject,
    html,
  })
}
