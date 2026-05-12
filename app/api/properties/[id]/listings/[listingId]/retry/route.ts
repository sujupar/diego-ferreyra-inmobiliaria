import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; listingId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, listingId } = await params

    // Solo roles operativos pueden gatillar retry de publicación
    const allowedRoles = ['admin', 'dueno', 'coordinador', 'asesor']
    if (!allowedRoles.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getAdmin()

    if (user.profile.role === 'asesor') {
      const { data: prop } = await supabase
        .from('properties')
        .select('assigned_to')
        .eq('id', id)
        .single()
      if (!prop || prop.assigned_to !== user.id) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    }

    const { error } = await supabase
      .from('property_listings')
      .update({
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', listingId)
      .eq('property_id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
