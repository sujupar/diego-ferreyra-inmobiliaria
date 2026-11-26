import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { existePerfil, getContact, updateContact } from '@/lib/supabase/contacts'
import { requireAuth, requireRole } from '@/lib/auth/require-role'
import { alcanceContactos, puedeReasignarContacto } from '@/lib/auth/contact-access'
import { canAccessContact } from '@/lib/auth/entity-access'
import { sanearDatosContacto, soloLoPropio } from '@/lib/crm/datos-contacto'

// Todo corre con service role: esta ruta es la ÚNICA barrera (design.md D4). Un contacto
// ajeno y uno inexistente reciben la MISMA respuesta, para no confirmar que existe.
const NO_ENCONTRADO = { error: 'No encontramos este contacto' }
const SIN_ACCESO = { error: 'No tenés acceso a los contactos.' }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // requireAuth fuera del try: lanza NEXT_REDIRECT y un catch lo volvería un 500.
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    const { id } = await params
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
  try {
    await requireRole('admin', 'dueno')
    const { id } = await params
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/contacts/[id] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
