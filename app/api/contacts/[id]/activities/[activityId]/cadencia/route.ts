import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'
import { armarActividadDeFicha } from '@/lib/crm/actividad-de-ficha'
import { existeContacto, leerActividadDelContacto, nombresDePerfiles } from '@/lib/supabase/actividades'
import { aplicarCadencia } from '@/lib/supabase/cadencia'

// "Reintentar" del aviso (design.md D7): completa, sin duplicar, lo que la cadencia debía
// hacer después de guardar. Sin cuerpo: el resultado, el día pedido, el "ahora" de la
// decisión, el proceso y quién registró salen de la fila guardada; de quien pide salen
// solo los botones. Service role: la ruta es la ÚNICA barrera, y la actividad se lee por
// su id Y el contacto de la URL (una de otro contacto da el mismo 404 que una inexistente).
const NO_ENCONTRADO = { error: 'No encontramos este contacto' }
const SIN_ACCESO = { error: 'No tenés acceso a los contactos.' }

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; activityId: string }> }) {
  // requireAuth fuera del try: lanza NEXT_REDIRECT y un catch lo volvería un 500.
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    const { id, activityId } = await params
    if (alcance === 'propios' && !(await canAccessContact(user, id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    if (alcance === 'todos' && !(await existeContacto(id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    const actividad = await leerActividadDelContacto(id, activityId)
    // Anulada o nota: no hay cadencia que reintentar (una anulada ya deshizo sus tareas).
    if (!actividad || actividad.voided_at || actividad.kind === 'note') {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }

    const usuario = { id: user.id, role: user.profile.role }
    const [{ cadencia, intento, pendiente }, nombres] = await Promise.all([
      aplicarCadencia(actividad, usuario),
      actividad.created_by ? nombresDePerfiles([actividad.created_by]) : Promise.resolve(new Map<string, string>()),
    ])
    const t = cadencia.tareaCreada
    return NextResponse.json({
      actividad: armarActividadDeFicha(actividad, {
        intento,
        autorNombre: actividad.created_by ? (nombres.get(actividad.created_by) ?? null) : null,
        tareaCreada: t ? { id: t.id, title: t.title, due_date: t.due_date, due_time: t.due_time } : null,
        usuario,
      }),
      cadencia,
      pendiente,
    })
  } catch (error) {
    console.error('POST /api/contacts/[id]/activities/[activityId]/cadencia error:', error)
    return NextResponse.json({ error: 'No se pudo completar. Probá de nuevo.' }, { status: 500 })
  }
}
