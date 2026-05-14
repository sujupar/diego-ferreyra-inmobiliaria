import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: visits } = await supabase
    .from('property_visits')
    .select('id, scheduled_at, client_name')
    .eq('property_id', id)

  const visitIds = (visits ?? []).map(v => v.id)
  if (visitIds.length === 0) return NextResponse.json({ data: [] })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: questionnaires } = await (supabase as any)
    .from('visit_questionnaires')
    .select('*')
    .in('visit_id', visitIds)
    .order('responded_at', { ascending: false })
    .limit(10)

  // Enrich with visit metadata
  const visitMap = Object.fromEntries((visits ?? []).map(v => [v.id, v]))
  const enriched = (questionnaires ?? []).map((q: Record<string, unknown>) => ({
    ...q,
    visit: visitMap[q.visit_id as string] ?? null,
  }))

  return NextResponse.json({ data: enriched })
}
