import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'
import { esUuid } from '@/lib/crm/id-valido'
import { datosParaCrearEnlace, leerEnlacePorContacto, obtenerOCrearEnlace } from '@/lib/video-bienvenida/enlaces'

/**
 * Enlace del video de bienvenida desde la ficha (tasacion-video-bienvenida, D8).
 *
 * GET: el enlace para copiar, o si se puede crear. POST: lo crea (o devuelve el que ya existe)
 * SIN mandar ningún mensaje: es para que Paula se lo mande a mano a quien se registró antes del
 * cambio. Mismos permisos que la ficha: el abogado no entra; el asesor, solo en sus contactos.
 * Un contacto ajeno y uno inexistente reciben la MISMA respuesta.
 */
const NO_ENCONTRADO = { error: 'No encontramos este contacto' }
const SIN_ACCESO = { error: 'No tenés acceso a los contactos.' }

type Acceso =
  | { ok: false; respuesta: NextResponse }
  | { ok: true; user: Awaited<ReturnType<typeof requireAuth>> }

async function acceso(id: string): Promise<Acceso> {
  const user = await requireAuth()
  if (alcanceContactos(user.profile.role) === 'ninguno') return { ok: false, respuesta: NextResponse.json(SIN_ACCESO, { status: 403 }) }
  if (!esUuid(id) || !(await canAccessContact(user, id))) return { ok: false, respuesta: NextResponse.json(NO_ENCONTRADO, { status: 404 }) }
  return { ok: true, user }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await acceso(id)
  if (!a.ok) return a.respuesta
  try {
    const enlace = await leerEnlacePorContacto(id)
    const puedeCrear = !enlace && (await datosParaCrearEnlace(id)) !== null
    return NextResponse.json({ enlace, puedeCrear })
  } catch (e) {
    console.error('[video-bienvenida] no se pudo leer el enlace de la ficha', e)
    return NextResponse.json({ error: 'No se pudo leer el enlace del video.' }, { status: 500 })
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await acceso(id)
  if (!a.ok) return a.respuesta
  try {
    const datos = await datosParaCrearEnlace(id)
    if (!datos) {
      return NextResponse.json({ error: 'Este contacto no tiene una solicitud de tasación del embudo.' }, { status: 400 })
    }
    const enlace = await obtenerOCrearEnlace({
      contactId: id, dealId: datos.dealId, nombre: datos.nombre, origen: 'manual', creadoPor: a.user.id,
    })
    if (!enlace) return NextResponse.json({ error: 'No se pudo crear el enlace. Probá de nuevo.' }, { status: 500 })
    return NextResponse.json({ enlace })
  } catch (e) {
    console.error('[video-bienvenida] no se pudo crear el enlace desde la ficha', e)
    return NextResponse.json({ error: 'No se pudo crear el enlace. Probá de nuevo.' }, { status: 500 })
  }
}
