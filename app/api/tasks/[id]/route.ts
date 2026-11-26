import { NextRequest, NextResponse } from 'next/server'
import { completeTask, dismissTask, leerAsignadoDeTarea } from '@/lib/supabase/tasks'
import { requireAuth } from '@/lib/auth/require-role'
import { hasPermission } from '@/lib/auth/roles'
import { esUuid } from '@/lib/crm/id-valido'

const NO_ENCONTRADA = { error: 'No encontramos esa tarea.' }

/**
 * Completar o descartar una tarea. Corre con service role: esta ruta es la barrera.
 * Reproduce la policy de la base sobre `tasks` (`tasks_update_assigned_or_ops`): la tarea
 * tiene que estar asignada a quien pide, o quien pide es de operaciones
 * (`pipeline.view_all`: admin, dueño, coordinador). Antes alcanzaba con tener sesión
 * (revisión 12.1, hallazgo 2).
 *
 * Quién la usa: `/tasks` (lista solo las propias) y el bloque Tareas de la ficha
 * (`LateralTareas`), donde la coordinación completa las de cualquiera y un asesor las suyas.
 * El abogado completa las suyas (las de revisión legal); no hay un 403 de rol, porque
 * cerrarle la ruta le impediría terminar su propio trabajo.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // requireAuth fuera del try: lanza NEXT_REDIRECT y un catch lo volvería un 500.
  const user = await requireAuth()
  try {
    const { id } = await params
    let action: unknown
    try {
      const cuerpo: unknown = await request.json()
      action = typeof cuerpo === 'object' && cuerpo !== null && 'action' in cuerpo ? cuerpo.action : undefined
    } catch {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    if (action !== 'complete' && action !== 'dismiss') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    if (!esUuid(id)) return NextResponse.json(NO_ENCONTRADA, { status: 404 })

    const tarea = await leerAsignadoDeTarea(id)
    if (!tarea) return NextResponse.json(NO_ENCONTRADA, { status: 404 })
    const esSuya = tarea.assigned_to !== null && tarea.assigned_to === user.id
    if (!esSuya && !hasPermission(user.profile.role, 'pipeline.view_all')) {
      return NextResponse.json(
        { error: 'Esta tarea es de otra persona: la puede cerrar ella o la coordinación.' },
        { status: 403 },
      )
    }

    if (action === 'complete') await completeTask(id)
    else await dismissTask(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'No se pudo guardar el cambio. Probá de nuevo.' }, { status: 500 })
  }
}
