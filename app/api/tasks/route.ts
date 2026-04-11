import { NextRequest, NextResponse } from 'next/server'
import { getMyTasks, createTask } from '@/lib/supabase/tasks'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const status = searchParams.get('status') || undefined
    if (!userId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
    const data = await getMyTasks(userId, status)
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const id = await createTask(body)
    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
