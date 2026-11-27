import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { hasPermission } from '@/lib/auth/roles'
import { esUuid } from '@/lib/crm/id-valido'
import { TIPOS_TAREA, type TipoTarea } from '@/lib/tareas/agenda'
import { leerAgenda, leerPersonas } from '@/lib/supabase/agenda-tareas'

// Pendientes (crm-tareas-y-campanita, D3). Lee con service role: el permiso se pone acá.
// Quien ve todo (`pipeline.view_all`, la misma regla que la policy de `tasks`) elige
// "mías", una persona o "todos"; el resto ve SIEMPRE las suyas, pida lo que pida.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await requireAuth()
  try {
    const sp = new URL(request.url).searchParams
    const propio = user.profile.id || user.id
    const veTodo = hasPermission(user.profile.role, 'pipeline.view_all')
    // Por defecto, como la maqueta: el admin y el dueño arrancan en "Todo el equipo".
    const porDefecto = user.profile.role === 'admin' || user.profile.role === 'dueno' ? 'todos' : 'mias'
    const pedido = sp.get('de') ?? porDefecto
    let asignados: string[] | 'todos' = [propio]
    if (veTodo) {
      if (pedido === 'todos') asignados = 'todos'
      else if (pedido !== 'mias') {
        if (!esUuid(pedido)) return NextResponse.json({ error: 'La persona pedida no es válida.' }, { status: 400 })
        asignados = [pedido]
      }
    }
    const tipoPedido = sp.get('tipo')
    const tipo = tipoPedido ? (TIPOS_TAREA.find((t) => t === tipoPedido) ?? null) : null
    if (tipoPedido && !tipo) return NextResponse.json({ error: 'Tipo de tarea desconocido.' }, { status: 400 })
    const desde = Number(sp.get('sin_fecha_desde') ?? '0')
    if (!Number.isInteger(desde) || desde < 0) return NextResponse.json({ error: 'La página pedida no es válida.' }, { status: 400 })

    const [agenda, personas] = await Promise.all([
      leerAgenda({ asignados, tipo: tipo as TipoTarea | null, sinFechaDesde: desde }, new Date()),
      veTodo ? leerPersonas() : Promise.resolve(null),
    ])
    return NextResponse.json({
      ...agenda,
      de: asignados === 'todos' ? 'todos' : asignados[0] === propio ? 'mias' : asignados[0],
      // Solo quien puede elegir recibe la lista (el asesor no tiene el filtro "De quién").
      personas,
    })
  } catch (error) {
    console.error('GET /api/tasks/agenda error:', error)
    return NextResponse.json({ error: 'No se pudieron traer las tareas. Probá de nuevo.' }, { status: 500 })
  }
}
