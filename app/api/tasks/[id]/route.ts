import { NextRequest, NextResponse } from 'next/server'
import { completarCopiasDeEntrada, completeTask, dismissTask, leerTareaParaCambio, posponerTarea, reabrirTarea } from '@/lib/supabase/tasks'
import { validarMomento } from '@/lib/tareas/agenda'
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
    let cuerpo: Record<string, unknown>
    try {
      const leido: unknown = await request.json()
      cuerpo = typeof leido === 'object' && leido !== null ? (leido as Record<string, unknown>) : {}
    } catch {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    const action = cuerpo.action
    if (action !== 'complete' && action !== 'dismiss' && action !== 'reopen' && action !== 'posponer') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    // Posponer: día y hora válidos y todavía no pasados (crm-tareas-y-campanita, D3).
    // `deshacer: true` es el "Deshacer" del aviso: vuelve a la fecha anterior tal cual, que
    // puede estar vencida o no existir (una tarea sin fecha).
    let nuevo: { fecha: string | null; hora: string | null } | null = null
    let siSigue: { fecha: string | null; hora: string | null } | undefined
    if (action === 'posponer') {
      const deshacer = cuerpo.deshacer === true
      const fecha = typeof cuerpo.due_date === 'string' ? cuerpo.due_date : null
      const hora = typeof cuerpo.due_time === 'string' ? cuerpo.due_time.slice(0, 5) : null
      const fechaOk = fecha !== null && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
      const horaOk = hora === null || /^\d{2}:\d{2}$/.test(hora)
      if (deshacer) {
        if ((fecha !== null && !fechaOk) || !horaOk || (fecha === null && hora !== null)) {
          return NextResponse.json({ error: 'Elegí un día y una hora válidos.' }, { status: 400 })
        }
      } else {
        if (!fechaOk || hora === null || !horaOk) {
          return NextResponse.json({ error: 'Elegí un día y una hora válidos.' }, { status: 400 })
        }
        const problema = validarMomento(fecha!, hora, new Date())
        if (problema) return NextResponse.json({ error: problema }, { status: 400 })
      }
      nuevo = { fecha, hora }
      if (deshacer) {
        const desdeFecha = typeof cuerpo.desde_fecha === 'string' ? cuerpo.desde_fecha : null
        const desdeHora = typeof cuerpo.desde_hora === 'string' ? cuerpo.desde_hora.slice(0, 5) : null
        siSigue = { fecha: desdeFecha, hora: desdeHora === null ? null : `${desdeHora}:00` }
      }
    }
    if (!esUuid(id)) return NextResponse.json(NO_ENCONTRADA, { status: 404 })

    const tarea = await leerTareaParaCambio(id)
    if (!tarea) return NextResponse.json(NO_ENCONTRADA, { status: 404 })
    const esSuya = tarea.assigned_to !== null && tarea.assigned_to === user.id
    if (!esSuya && !hasPermission(user.profile.role, 'pipeline.view_all')) {
      return NextResponse.json(
        { error: 'Esta tarea es de otra persona: la puede cerrar ella o la coordinación.' },
        { status: 403 },
      )
    }

    if (action === 'complete') {
      await completeTask(id, user.id)
      // La copia de la otra coordinadora también: el lead ya se atendió. Si falla, la tarea
      // pedida igual quedó completada; la copia se cierra a mano.
      try {
        await completarCopiasDeEntrada(id, user.id)
      } catch (e) {
        console.error('PUT /api/tasks/[id]: no se pudieron completar las copias de la entrada', e)
      }
    }
    else if (action === 'dismiss') await dismissTask(id)
    else if (action === 'reopen') {
      const r = await reabrirTarea(id)
      if (r === 'conflicto') return NextResponse.json({ error: 'Ya hay otra tarea igual pendiente.' }, { status: 409 })
      if (r === 'no_estaba_completada') {
        return NextResponse.json({ error: 'Esa tarea no se puede reabrir acá: no estaba completada o la cerró una llamada.' }, { status: 409 })
      }
    } else if (nuevo) {
      if (!(await posponerTarea(id, nuevo.fecha, nuevo.hora, siSigue))) {
        const error = siSigue ? 'Esa tarea cambió mientras tanto: no se pudo deshacer.' : 'Esa tarea ya no está pendiente.'
        return NextResponse.json({ error }, { status: 409 })
      }
      // La fecha anterior viaja para el "Deshacer" del aviso.
      return NextResponse.json({
        success: true,
        anterior: { due_date: tarea.due_date, due_time: tarea.due_time ? tarea.due_time.slice(0, 5) : null },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'No se pudo guardar el cambio. Probá de nuevo.' }, { status: 500 })
  }
}
