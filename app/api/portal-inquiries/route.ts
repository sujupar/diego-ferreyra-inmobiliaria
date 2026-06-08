import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

// Cliente service-role sin tipar: las tablas portal_* no están en database.types
// todavía. Replicamos el filtro por rol acá (igual que /api/leads).
function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * GET /api/portal-inquiries?portal=X&days=N&unmatched=1&limit=200
 * Lista las consultas de portales (sección "Consultas" del inbox).
 * Asesor ve solo lo asignado a él; operations ve todo.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const role = user.profile.role
    if (!['admin', 'dueno', 'coordinador', 'asesor'].includes(role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const portal = url.searchParams.get('portal')
    const days = parseInt(url.searchParams.get('days') ?? '30', 10)
    const unmatched = url.searchParams.get('unmatched') === '1'
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10), 500)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const supabase = getAdmin()
    let query = supabase
      .from('portal_inquiries')
      .select(
        'id, seq, portal, inquiry_type, received_at, lead_name, lead_email, lead_phone, lead_message, property_external_code, property_url, property_address, matched_map_id, assigned_to, is_unmatched, raw_subject, created_at',
      )
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (portal) query = query.eq('portal', portal)
    if (unmatched) query = query.eq('is_unmatched', true)
    if (role === 'asesor') query = query.eq('assigned_to', user.id)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Hidratar el nombre del asesor asignado.
    const assignedIds = Array.from(
      new Set((data ?? []).map((d: { assigned_to: string | null }) => d.assigned_to).filter(Boolean) as string[]),
    )
    let nameMap = new Map<string, string | null>()
    if (assignedIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', assignedIds)
      nameMap = new Map((profs ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))
    }

    const enriched = (data ?? []).map((d: { assigned_to: string | null }) => ({
      ...d,
      assigned_name: d.assigned_to ? nameMap.get(d.assigned_to) ?? null : null,
    }))

    return NextResponse.json({ data: enriched })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
