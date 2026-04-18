import { NextRequest, NextResponse } from 'next/server'
import { getLegalEvents } from '@/lib/supabase/legal-events'
import { requireAuth } from '@/lib/auth/require-role'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  return NextResponse.json({ data: await getLegalEvents(id) })
}
