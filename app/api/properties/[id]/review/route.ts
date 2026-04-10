import { NextRequest, NextResponse } from 'next/server'
import { reviewProperty } from '@/lib/supabase/properties'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { approved, reviewer_id, notes } = await request.json()

    if (typeof approved !== 'boolean' || !reviewer_id) {
      return NextResponse.json({ error: 'Missing approved or reviewer_id' }, { status: 400 })
    }

    await reviewProperty(id, approved, reviewer_id, notes)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
