import { NextRequest, NextResponse } from 'next/server'
import { getScheduledAppraisal } from '@/lib/supabase/scheduled-appraisals'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const data = await getScheduledAppraisal(id)
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ data })
}
