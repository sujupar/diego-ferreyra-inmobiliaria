import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function authorize(
  leadId: string,
  user: Awaited<ReturnType<typeof requireAuth>>,
): Promise<{ ok: true } | { ok: false; reason: string; status: number }> {
  const allowed = ['admin', 'dueno', 'coordinador', 'asesor']
  if (!allowed.includes(user.profile.role)) {
    return { ok: false, reason: 'forbidden', status: 403 }
  }
  if (user.profile.role !== 'asesor') return { ok: true }

  // Asesor: verificar que el lead esté en una propiedad suya
  const supabase = getAdmin()
  const { data: lead } = await supabase
    .from('property_leads')
    .select('property_id, assigned_to')
    .eq('id', leadId)
    .single()
  if (!lead) return { ok: false, reason: 'not_found', status: 404 }
  if (lead.assigned_to === user.id) return { ok: true }

  const { data: prop } = await supabase
    .from('properties')
    .select('assigned_to')
    .eq('id', lead.property_id)
    .single()
  if (prop?.assigned_to === user.id) return { ok: true }
  return { ok: false, reason: 'forbidden', status: 403 }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const auth = await authorize(id, user)
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

    const supabase = getAdmin()
    const { data: lead, error } = await supabase
      .from('property_leads')
      .select('id, property_id, name, email, phone, message, source, status, assigned_to, notes, utm, created_at')
      .eq('id', id)
      .single()
    if (error || !lead) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const { data: property } = await supabase
      .from('properties')
      .select('address, title, neighborhood, public_slug')
      .eq('id', lead.property_id)
      .single()

    return NextResponse.json({ data: { ...lead, properties: property ?? null } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

const UpdateSchema = z.object({
  status: z.enum(['new', 'contacted', 'scheduled', 'discarded']).optional(),
  notes: z.string().max(5000).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const auth = await authorize(id, user)
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

    const body = await req.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid', detail: parsed.error.flatten() },
        { status: 400 },
      )
    }

    // Asesor no puede reasignar leads de su propiedad a otro
    if (user.profile.role === 'asesor' && parsed.data.assigned_to !== undefined) {
      return NextResponse.json(
        { error: 'Asesor no puede reasignar leads' },
        { status: 403 },
      )
    }

    const supabase = getAdmin()
    const update: Partial<{
      status: string
      notes: string | null
      assigned_to: string | null
    }> = {}
    if (parsed.data.status !== undefined) update.status = parsed.data.status
    if (parsed.data.notes !== undefined) update.notes = parsed.data.notes
    if (parsed.data.assigned_to !== undefined) update.assigned_to = parsed.data.assigned_to

    const { error } = await supabase
      .from('property_leads')
      .update(update)
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
