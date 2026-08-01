/**
 * El cliente propone día y franja desde la página del recorrido.
 * No pide datos: salen del token. La visita queda 'pending_confirmation' y la
 * confirma el equipo (decisión de producto: no hay disponibilidad real por asesor).
 */
import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/leads/access-token'
import {
  admin,
  FRANJA_HORA,
  hoyEnArgentina,
  sumarDias,
  isFranja,
  upsertPendingVisit,
  notifyAndAdvancePipeline,
} from '@/lib/leads/visit-scheduling'

/** Ventana de agenda: desde mañana hasta 90 días. Endpoint público sin sesión. */
const MAX_DIAS_ADELANTE = 90

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const access = await getAccessToken(token)
    if (!access) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as { date?: string; franja?: string }
    const date = typeof body.date === 'string' ? body.date : ''
    const franjaRaw = typeof body.franja === 'string' ? body.franja : 'manana'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Elegí un día válido' }, { status: 400 })
    }
    if (!isFranja(franjaRaw)) {
      return NextResponse.json({ error: 'Elegí un momento del día válido' }, { status: 400 })
    }
    const franja = franjaRaw
    // Rango razonable: desde mañana hasta 90 días. Sin esto un `2019-01-01`
    // entra igual y queda una visita en el pasado en el CRM.
    const hoy = hoyEnArgentina()
    const minimo = sumarDias(hoy, 1)
    const maximo = sumarDias(hoy, MAX_DIAS_ADELANTE)
    if (date < minimo) {
      return NextResponse.json(
        { error: 'Elegí un día a partir de mañana.' },
        { status: 400 },
      )
    }
    if (date > maximo) {
      return NextResponse.json(
        { error: `Elegí un día dentro de los próximos ${MAX_DIAS_ADELANTE} días.` },
        { status: 400 },
      )
    }
    const hora = FRANJA_HORA[franja] ?? 9
    // -03:00 = hora de Argentina; guardamos el instante correcto en UTC.
    const scheduledAt = new Date(`${date}T${String(hora).padStart(2, '0')}:00:00-03:00`)
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: 'Elegí un día válido' }, { status: 400 })
    }
    // `new Date('2026-02-31T...')` NO da NaN: JS lo corre en silencio al 3 de
    // marzo. Comprobamos que el día calendario sobreviva el ida y vuelta en
    // horario argentino — si no, la fecha no existe y la rechazamos.
    const enArgentina = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(scheduledAt)
    if (enArgentina !== date) {
      return NextResponse.json({ error: 'Elegí un día válido' }, { status: 400 })
    }

    const sb = admin()
    const { data: prop } = await sb
      .from('properties')
      .select('id, assigned_to')
      .eq('id', access.propertyId)
      .maybeSingle()

    const notes = `Propuesta por el cliente desde el recorrido (franja: ${franja}).`

    // "La última propuesta gana": si esta persona ya propuso un día desde este
    // mismo token y sigue sin confirmar, se ACTUALIZA esa visita en vez de
    // sembrar duplicados en el CRM. Si el equipo ya la confirmó (o la canceló),
    // no la tocamos: se registra una propuesta nueva.
    const { data: tokenRow } = await sb
      .from('lead_access_tokens')
      .select('visit_id, lead_id')
      .eq('token', token)
      .maybeSingle()
    const previousVisitId = (tokenRow as { visit_id?: string | null } | null)?.visit_id ?? null
    const leadId = (tokenRow as { lead_id?: string | null } | null)?.lead_id ?? null

    const result = await upsertPendingVisit(sb, {
      propertyId: access.propertyId,
      advisorId: (prop as { assigned_to?: string | null } | null)?.assigned_to ?? null,
      clientName: access.name,
      clientEmail: access.email,
      clientPhone: access.phone,
      scheduledAt,
      notes,
      existingVisitId: previousVisitId,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    const visitId = result.visitId

    // Medición + vínculo token→visita (lo que permite el "última propuesta gana").
    await sb
      .from('lead_access_tokens')
      .update({ scheduled_at: new Date().toISOString(), visit_id: visitId })
      .eq('token', token)

    // Notificar al equipo + avanzar el embudo (`nuevo|contactado → visita_agendada`,
    // solo si el token nació de un lead real). Best-effort, nunca lanza.
    await notifyAndAdvancePipeline(visitId, leadId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
