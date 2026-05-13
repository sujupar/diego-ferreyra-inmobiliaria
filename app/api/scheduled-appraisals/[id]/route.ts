import { NextRequest, NextResponse } from 'next/server'
import { getScheduledAppraisal } from '@/lib/supabase/scheduled-appraisals'
import { getUser } from '@/lib/auth/get-user'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const data = await getScheduledAppraisal(id)
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ data })
}
