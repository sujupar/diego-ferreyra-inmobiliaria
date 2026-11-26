import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'
import { esquemaNuevaActividad } from '@/lib/crm/actividades'
import { armarActividadDeFicha } from '@/lib/crm/actividad-de-ficha'
import { elegirDealActivo } from '@/lib/crm/deal-activo'
import { insertarActividad, leerActividadPorToken, leerProcesosDelContacto, type FilaActividad } from '@/lib/supabase/actividades'
import type { UserWithProfile } from '@/types/auth.types'

// Todo corre con service role: esta ruta es la ÚNICA barrera (design.md D4). Un contacto
// ajeno y uno inexistente reciben la MISMA respuesta, para no confirmar que existe.
const NO_ENCONTRADO = { error: 'No encontramos este contacto' }
const SIN_ACCESO = { error: 'No tenés acceso a los contactos.' }
const NO_SE_GUARDO = { error: 'No se pudo guardar. Probá de nuevo.' }
// Tarea 6.2: llamadas y WhatsApp necesitan `aplicarCadencia` (lib/supabase/cadencia.ts),
// que depende de las reglas de cadencia todavía sin cerrar. Guardarlas sin cadencia
// dejaría llamadas que no cierran ni crean tareas y que después no se podrían
// "completar" sin un reintento a mano: se rechazan explícitamente hasta entonces.
const LLAMADAS_TODAVIA_NO = { error: 'Registrar llamadas y WhatsApp todavía no está disponible.' }

function respuestaDeNota(fila: FilaActividad, user: UserWithProfile) {
  return {
    actividad: armarActividadDeFicha(fila, {
      intento: null,
      // En la nota nueva y en la repetida el autor es quien pide (si no, es un 409).
      autorNombre: user.profile.full_name ?? null,
      tareaCreada: null,
      usuario: { id: user.id, role: user.profile.role },
    }),
    // Una nota no corre la cadencia (D4): ni tareas creadas ni cerradas.
    cadencia: null,
    pendiente: false,
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // requireAuth fuera del try: lanza NEXT_REDIRECT y un catch lo volvería un 500.
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    const { id } = await params
    let cuerpo: unknown
    try {
      cuerpo = await request.json()
    } catch {
      return NextResponse.json({ error: 'El pedido no se entiende.' }, { status: 400 })
    }
    const validado = esquemaNuevaActividad.safeParse(cuerpo)
    if (!validado.success) {
      return NextResponse.json({ error: validado.error.issues[0]?.message ?? 'El pedido no se entiende.' }, { status: 400 })
    }
    const nueva = validado.data
    if (nueva.kind !== 'note') return NextResponse.json(LLAMADAS_TODAVIA_NO, { status: 501 })

    if (alcance === 'propios' && !(await canAccessContact(user, id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    const { existe, procesos } = await leerProcesosDelContacto(id)
    if (!existe) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    const activo = elegirDealActivo(procesos)

    // Lista cerrada: autor = sesión, proceso = el activo de ahora. Sin `occurred_at`:
    // lo pone la base igual a `created_at` (D2, `resolverOcurrio`).
    const resultado = await insertarActividad({
      contact_id: id,
      deal_id: activo?.id ?? null,
      kind: 'note',
      body: nueva.body,
      created_by: user.id,
      client_token: nueva.client_token,
    })
    if (resultado.ok) return NextResponse.json(respuestaDeNota(resultado.fila, user), { status: 201 })

    // El mismo guardado llegó dos veces. Solo se devuelve lo propio (D4): otro autor u
    // otro contacto → 409 sin ningún dato del otro registro. Un token de nota que ya usó
    // una llamada propia tampoco es "el mismo guardado": su respuesta lleva cadencia.
    const existente = await leerActividadPorToken(nueva.client_token)
    if (!existente || existente.contact_id !== id || existente.created_by !== user.id || existente.kind !== 'note') {
      return NextResponse.json(NO_SE_GUARDO, { status: 409 })
    }
    return NextResponse.json(respuestaDeNota(existente, user), { status: 200 })
  } catch (error) {
    console.error('POST /api/contacts/[id]/activities error:', error)
    return NextResponse.json(NO_SE_GUARDO, { status: 500 })
  }
}
