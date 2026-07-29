/**
 * El cliente propone día y franja desde la página del recorrido.
 * No pide datos: salen del token. La visita queda 'pending_confirmation' y la
 * confirma el equipo (decisión de producto: no hay disponibilidad real por asesor).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken } from '@/lib/leads/access-token'
import { notifyVisitProposed } from '@/lib/email/notifications/visit-proposed'

/** Hora de inicio por franja (hora local de Buenos Aires, UTC-3). */
const FRANJA_HORA: Record<string, number> = { manana: 9, mediodia: 12, tarde: 15 }

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const access = await getAccessToken(token)
    if (!access) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as { date?: string; franja?: string }
    const date = typeof body.date === 'string' ? body.date : ''
    const franja = typeof body.franja === 'string' ? body.franja : 'manana'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Elegí un día válido' }, { status: 400 })
    }
    const hora = FRANJA_HORA[franja] ?? 9
    // -03:00 = hora de Argentina; guardamos el instante correcto en UTC.
    const scheduledAt = new Date(`${date}T${String(hora).padStart(2, '0')}:00:00-03:00`)
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: 'Elegí un día válido' }, { status: 400 })
    }

    const sb = admin()
    const { data: prop } = await sb
      .from('properties')
      .select('id, assigned_to')
      .eq('id', access.propertyId)
      .maybeSingle()

    const { data: visit, error } = await sb
      .from('property_visits')
      .insert({
        property_id: access.propertyId,
        advisor_id: (prop as { assigned_to?: string | null } | null)?.assigned_to ?? null,
        client_name: access.name,
        client_email: access.email,
        client_phone: access.phone,
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending_confirmation',
        notes: `Propuesta por el cliente desde el recorrido (franja: ${franja}).`,
      })
      .select('id')
      .single()
    if (error || !visit) {
      return NextResponse.json({ error: error?.message ?? 'No pudimos registrar la visita' }, { status: 500 })
    }

    // Medición: desde qué token salió la visita.
    await sb.from('lead_access_tokens').update({ scheduled_at: new Date().toISOString() }).eq('token', token)

    // Notificar al equipo. Best-effort: la visita YA está registrada.
    try {
      await notifyVisitProposed((visit as { id: string }).id)
    } catch (err) {
      console.error('[schedule] notificación falló (visita igual registrada):', err)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
