import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { INICIO_AVISOS } from '@/lib/tareas/agenda'
import { leerAvisos } from '@/lib/supabase/agenda-tareas'

// La campanita (crm-tareas-y-campanita, D3): SOLO las tareas de quien pide, sin parámetros.
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireAuth()
  try {
    return NextResponse.json(await leerAvisos(user.profile.id || user.id, new Date(), INICIO_AVISOS))
  } catch (error) {
    console.error('GET /api/tasks/avisos error:', error)
    return NextResponse.json({ error: 'No se pudieron actualizar los avisos.' }, { status: 500 })
  }
}
