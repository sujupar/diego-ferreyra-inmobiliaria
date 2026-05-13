import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const role = req.nextUrl.searchParams.get('role')
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  let q = supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  if (role) q = q.eq('role', role)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
