import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET() {
  try {
    await requireRole('admin', 'dueno')
    const supabase = getAdmin()
    const { data, error } = await supabase
      .from('portal_credentials')
      .select('portal, enabled, expires_at, updated_at, metadata')
      .order('portal', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: Request) {
  try {
    await requireRole('admin', 'dueno')
    const body = (await req.json()) as { portal?: string; enabled?: boolean }
    if (!body.portal || typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'portal and enabled required' }, { status: 400 })
    }
    const supabase = getAdmin()
    const { error } = await supabase
      .from('portal_credentials')
      .update({ enabled: body.enabled })
      .eq('portal', body.portal)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
