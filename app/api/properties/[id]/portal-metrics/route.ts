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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const url = new URL(req.url)
    const days = Math.min(
      Math.max(parseInt(url.searchParams.get('days') ?? '30', 10), 1),
      365,
    )
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

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

    const { data, error } = await supabase
      .from('property_metrics_daily')
      .select('*')
      .eq('property_id', id)
      .gte('date', since)
      .order('date', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
