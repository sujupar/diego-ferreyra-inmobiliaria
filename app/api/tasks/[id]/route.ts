import { NextRequest, NextResponse } from 'next/server'
import { completeTask, dismissTask } from '@/lib/supabase/tasks'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { action } = await request.json()

    if (action === 'complete') await completeTask(id)
    else if (action === 'dismiss') await dismissTask(id)
    else return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
