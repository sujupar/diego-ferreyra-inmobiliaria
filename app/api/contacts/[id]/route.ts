import { NextRequest, NextResponse } from 'next/server'
import { deleteContact, existePerfil, getContact, updateContact } from '@/lib/supabase/contacts'
import { requireAuth } from '@/lib/auth/require-role'
import type { Role } from '@/types/auth.types'
import { alcanceContactos, puedeReasignarContacto } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'
import { sanearDatosContacto, soloLoPropio } from '@/lib/crm/datos-contacto'
import { esUuid } from '@/lib/crm/id-valido'

// Todo corre con service role: esta ruta es la ÚNICA barrera (design.md D4). Un contacto
// ajeno y uno inexistente reciben la MISMA respuesta, para no confirmar que existe.
const NO_ENCONTRADO = { error: 'No encontramos este contacto' }
const SIN_ACCESO = { error: 'No tenés acceso a los contactos.' }
const ROLES_QUE_BORRAN: Role[] = ['admin', 'dueno']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // requireAuth fuera del try: lanza NEXT_REDIRECT y un catch lo volvería un 500.
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    const { id } = await params
    // Un id que no es uuid no puede existir: 404, no el 500 de Postgres (revisión 12.1).
    if (!esUuid(id)) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    if (alcance === 'propios' && !(await canAccessContact(user, id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    const data = await getContact(id)
    if (!data) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    // Poder abrir el contacto no es poder ver lo de otros asesores (D4).
    return NextResponse.json(alcance === 'propios' ? soloLoPropio(data, user.id) : data)
  } catch (error) {
    console.error('GET /api/contacts/[id] error:', error)
    return NextResponse.json({ error: 'No se pudo cargar el contacto. Probá de nuevo.' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    const { id } = await params
    // Un id que no es uuid no puede existir: 404, no el 500 de Postgres (revisión 12.1).
    if (!esUuid(id)) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'El pedido no se entiende.' }, { status: 400 })
    }
    if (alcance === 'propios' && !(await canAccessContact(user, id))) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    // Lista cerrada y parcial: el Background se guarda solo con { notes }. Un
    // `assigned_to` de quien no puede reasignar se descarta en silencio.
    const saneado = sanearDatosContacto(body, {
      modo: 'editar',
      puedeReasignar: puedeReasignarContacto(user.profile.role),
    })
    if (!saneado.ok) return NextResponse.json({ error: saneado.error }, { status: 400 })
    const asesor = saneado.cambios.assigned_to
    if (asesor && !(await existePerfil(asesor))) {
      return NextResponse.json({ error: 'Ese usuario no existe.' }, { status: 400 })
    }
    const actualizado = await updateContact(id, saneado.cambios)
    if (!actualizado) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/contacts/[id] error:', error)
    return NextResponse.json({ error: 'No se pudo guardar. Probá de nuevo.' }, { status: 500 })
  }
}

/**
 * DELETE /api/contacts/[id]
 *
 * Borra el contacto definitivamente. Sus referencias en appraisals,
 * properties, scheduled_appraisals, deals, tasks quedan con contact_id=NULL
 * gracias a la migración 20260512000005 (ON DELETE SET NULL). Solo admin/dueño.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // NO se usa `requireRole`: hace `redirect('/')`, y el `fetch` de la lista lo seguiría
  // hasta un 200 y sacaría de la pantalla un contacto que no se borró (D4).
  const user = await requireAuth()
  if (!ROLES_QUE_BORRAN.includes(user.profile.role)) {
    return NextResponse.json({ error: 'Solo un administrador o el dueño pueden borrar contactos.' }, { status: 403 })
  }
  try {
    const { id } = await params
    // Un id que no es uuid no puede existir: 404, no el 500 de Postgres (revisión 12.1).
    if (!esUuid(id)) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    const borrado = await deleteContact(id)
    if (!borrado) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/contacts/[id] error:', error)
    return NextResponse.json({ error: 'No se pudo borrar el contacto. Probá de nuevo.' }, { status: 500 })
  }
}
