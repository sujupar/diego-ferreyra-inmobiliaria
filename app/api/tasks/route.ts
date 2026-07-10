import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMyTasks, createTask } from '@/lib/supabase/tasks'
import { requireAuth } from '@/lib/auth/require-role'
import { getUser } from '@/lib/auth/get-user'
import { validateTaskInput } from '@/lib/tasks/validate-task-input'

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
  // getUser() nos da el rol (para autorizar asignación a otro usuario). Fuera del try
  // para no enmascarar el 401 como 500.
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const body = await request.json()
    const today = new Date().toISOString().slice(0, 10)

    // Toda tarea creada por HTTP es un follow_up de usuario. La validación + la regla
    // de autorización de asignación viven en validateTaskInput (pura, testeada). Esto
    // también evita que el cliente cree tipos de sistema (new_assignment, etc.).
    const parsed = validateTaskInput(body, { id: user.id, role: user.profile.role }, today)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }

    // Si se asigna a otro usuario, verificar que exista, esté activo y sea destinatario válido.
    if (parsed.value.assigned_to !== user.id) {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { data: target } = await admin
        .from('profiles').select('id, is_active, role')
        .eq('id', parsed.value.assigned_to).maybeSingle()
      if (!target || target.is_active === false || target.role === 'abogado') {
        return NextResponse.json({ error: 'Usuario destinatario inválido.' }, { status: 400 })
      }
    }

    const id = await createTask(parsed.value)
    // createTask devuelve null cuando ya existe una tarea pending equivalente
    // (guarda de idempotencia). Lo exponemos explícito.
    if (id === null) {
      return NextResponse.json({ success: true, skipped: true, reason: 'duplicate_pending_task' })
    }
    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
