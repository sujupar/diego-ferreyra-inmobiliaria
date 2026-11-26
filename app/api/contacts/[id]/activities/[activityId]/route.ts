import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'
import { esUltimoIntento, esquemaCambioActividad, puedeAnular, puedeEditarNota } from '@/lib/crm/actividades'
import { armarActividadDeFicha } from '@/lib/crm/actividad-de-ficha'
import { anularActividad, editarNota, intentosNoAnulados, leerActividadDelContacto } from '@/lib/supabase/actividades'
import { undoTasksOfActivity } from '@/lib/supabase/tasks'

// Todo corre con service role: esta ruta es la ÚNICA barrera (design.md D4). La
// actividad se lee SIEMPRE por su id y el contacto de la URL: una de otro contacto da el
// mismo 404 que una inexistente, así un asesor con acceso a X no toca registros de Y.
const NO_ENCONTRADO = { error: 'No encontramos este contacto' }
const SIN_ACCESO = { error: 'No tenés acceso a los contactos.' }
const NO_SE_GUARDO = { error: 'No se pudo guardar. Probá de nuevo.' }
const SIN_TAREAS = { descartadas: 0, reabiertas: 0 }

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  // requireAuth fuera del try: lanza NEXT_REDIRECT y un catch lo volvería un 500.
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  const usuario = { id: user.id, role: user.profile.role }
  try {
    const { id, activityId } = await params
    let cuerpo: unknown
    try {
      cuerpo = await request.json()
    } catch {
      return NextResponse.json({ error: 'El pedido no se entiende.' }, { status: 400 })
    }
    const validado = esquemaCambioActividad.safeParse(cuerpo)
    if (!validado.success) {
      return NextResponse.json({ error: validado.error.issues[0]?.message ?? 'El pedido no se entiende.' }, { status: 400 })
    }
    if (alcance === 'propios' && !(await canAccessContact(user, id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    const actividad = await leerActividadDelContacto(id, activityId)
    if (!actividad) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    const cambio = validado.data

    if (cambio.accion === 'editar') {
      // Una llamada o un WhatsApp no se reescriben: ni resultado ni comentario (spec).
      if (actividad.kind !== 'note') {
        return NextResponse.json({ error: 'Solo se pueden editar las notas.' }, { status: 400 })
      }
      if (!puedeEditarNota(actividad, usuario)) {
        return NextResponse.json({ error: 'Solo quien escribió la nota puede editarla.' }, { status: 403 })
      }
      const editada = await editarNota(id, activityId, cambio.body)
      // La anularon entre la lectura y la escritura: no se reescribe lo anulado.
      if (!editada) return NextResponse.json(NO_SE_GUARDO, { status: 409 })
      return NextResponse.json({
        actividad: armarActividadDeFicha(editada, {
          intento: null,
          autorNombre: user.profile.full_name ?? null, // solo el autor edita
          tareaCreada: null,
          usuario,
        }),
      })
    }

    if (!puedeAnular(actividad, usuario)) {
      return NextResponse.json({ error: 'No podés borrar este registro.' }, { status: 403 })
    }
    // Anular dos veces no reescribe quién ni cuándo (D8); sí repite lo de las tareas.
    if (!actividad.voided_at) await anularActividad(id, activityId, user.id)
    if (actividad.kind === 'note') return NextResponse.json({ ok: true, tareas: SIN_TAREAS })

    // Solo el último intento no anulado de su proceso deshace tareas: si ya hubo otro
    // después, reabrir o descartar dejaría la lista peor que antes (D8).
    const intentos = await intentosNoAnulados(id, actividad.deal_id)
    if (!esUltimoIntento(actividad, intentos)) return NextResponse.json({ ok: true, tareas: SIN_TAREAS })
    try {
      const tareas = await undoTasksOfActivity(activityId)
      return NextResponse.json({ ok: true, tareas })
    } catch (error) {
      // El registro ya quedó anulado; volver a pedir "anular" repite solo esta parte.
      console.error('PATCH …/activities/[activityId]: anulado, pero no se deshicieron sus tareas', { activityId, error })
      return NextResponse.json(
        { error: 'Se anuló, pero no se pudieron deshacer sus tareas. Probá de nuevo.' },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('PATCH /api/contacts/[id]/activities/[activityId] error:', error)
    return NextResponse.json(NO_SE_GUARDO, { status: 500 })
  }
}
