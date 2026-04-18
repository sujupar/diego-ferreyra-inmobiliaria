import { NextRequest, NextResponse } from 'next/server'
import { getDeal, updateDealNotes } from '@/lib/supabase/deals'
import { requireAuth } from '@/lib/auth/require-role'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const data = await getDeal(id)
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const body = await request.json()
    const { notes } = body
    if (typeof notes !== 'string') {
      return NextResponse.json({ error: 'notes required (string)' }, { status: 400 })
    }
    await updateDealNotes(id, notes)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/deals/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 })
  }
}
