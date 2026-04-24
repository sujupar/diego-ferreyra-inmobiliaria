import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-role'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission('settings.manage')
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const type = searchParams.get('type')
    const status = searchParams.get('status')

    let query = getAdmin()
      .from('email_notifications_log')
      .select('*', { count: 'exact' })
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (type) query = query.eq('notification_type', type)
    if (status) query = query.eq('status', status)

    const { data, error, count } = await query
    if (error) throw error
    return NextResponse.json({ data: data ?? [], total: count ?? 0 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
