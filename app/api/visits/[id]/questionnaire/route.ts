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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('visit_questionnaires')
    .select('*')
    .eq('visit_id', id)
    .order('responded_at', { ascending: false })

  if (error) {
    console.error('[GET /api/visits/[id]/questionnaire]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}
