import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'
import { tareasVisiblesEnFicha } from '@/lib/crm/tareas-ficha'
import { leerProcesosDelContacto } from '@/lib/supabase/actividades'
import { getPendingTasksForContact } from '@/lib/supabase/tasks'

// Todo corre con service role: esta ruta es la ÚNICA barrera (design.md D4).
const NO_ENCONTRADO = { error: 'No encontramos este contacto' }
const SIN_ACCESO = { error: 'No tenés acceso a los contactos.' }

/**
 * Tareas pendientes del contacto y de sus procesos, pasadas por `tareasVisiblesEnFicha`
 * (D3). `total` es el largo de la lista YA filtrada: el número de "Tareas · N" cuenta lo
 * que se lista, así un asesor nunca ve un número que no puede abrir.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    const { id } = await params
    if (alcance === 'propios' && !(await canAccessContact(user, id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    const { existe, procesos } = await leerProcesosDelContacto(id)
    if (!existe) return NextResponse.json(NO_ENCONTRADO, { status: 404 })

    const todas = await getPendingTasksForContact(id, procesos.map((p) => p.id))
    const propios = alcance === 'propios'
    const tareas = tareasVisiblesEnFicha(todas, {
      // Coordinada = `scheduled` con día: esa tasación ya se ve en su tarjeta.
      dealsConTasacionAgendada: procesos.filter((p) => p.stage === 'scheduled' && !!p.scheduled_date).map((p) => p.id),
      // Para un asesor, todo proceso que no está a su nombre (también los sin asesor).
      dealsOcultos: propios ? procesos.filter((p) => p.assigned_to !== user.id).map((p) => p.id) : [],
      usuarioId: user.id,
      soloPropiasSinProceso: propios,
    })
    return NextResponse.json({ tareas, total: tareas.length })
  } catch (error) {
    console.error('GET /api/contacts/[id]/tasks error:', error)
    return NextResponse.json({ error: 'No se pudieron cargar las tareas. Probá de nuevo.' }, { status: 500 })
  }
}
