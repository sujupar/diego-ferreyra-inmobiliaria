import { NextRequest, NextResponse } from 'next/server'
import { getMyTasks, createTask } from '@/lib/supabase/tasks'
import { requireAuth } from '@/lib/auth/require-role'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
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
    const user = await requireAuth()
    const body = await request.json()

    // Validación específica para follow-ups agendados desde el modal de Seguimiento.
    if (body?.type === 'follow_up') {
      // Defaults: el creador es también el asignado salvo que el cliente diga lo contrario.
      if (!body.assigned_to) body.assigned_to = user.id
      if (!body.created_by) body.created_by = user.id
      const validChannels = ['call', 'email', 'message']
      if (!body.channel || !validChannels.includes(body.channel)) {
        return NextResponse.json({ error: 'Canal inválido. Debe ser call, email o message.' }, { status: 400 })
      }
      if (!body.due_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
        return NextResponse.json({ error: 'Fecha requerida (YYYY-MM-DD).' }, { status: 400 })
      }
      const today = new Date().toISOString().slice(0, 10)
      if (body.due_date < today) {
        return NextResponse.json({ error: 'La fecha del seguimiento no puede ser anterior a hoy.' }, { status: 400 })
      }
      if (body.all_day === false && !body.due_time) {
        return NextResponse.json({ error: 'Si no es todo el día, debés indicar una hora.' }, { status: 400 })
      }
      // Normalizar: si es all_day, limpiar due_time aunque venga seteado.
      if (body.all_day !== false) {
        body.all_day = true
        body.due_time = null
      }
    }

    const id = await createTask(body)
    // createTask returns null when an equivalent pending task already exists
    // (idempotency guard). Surface that explicitly so clients don't
    // mistakenly use a null id downstream.
    if (id === null) {
      return NextResponse.json({ success: true, skipped: true, reason: 'duplicate_pending_task' })
    }
    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
