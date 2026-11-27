import { NextRequest, NextResponse } from 'next/server'
import { createContact, existePerfil, getContacts } from '@/lib/supabase/contacts'
import { requireAuth } from '@/lib/auth/require-role'
import { resolverAlcanceAsignado } from '@/lib/auth/scope'
import { alcanceContactos, puedeReasignarContacto } from '@/lib/auth/contact-access'
import { sanearDatosContacto } from '@/lib/crm/datos-contacto'

const SIN_ACCESO = { error: 'No tenés acceso a los contactos.' }

/**
 * SIN CONSUMIDOR DE PANTALLA desde crm-cartera-por-rol (tarea 6.4): la lista de Contactos
 * lee `/api/crm/contactos`, que aplica la regla de acceso de la ficha y pagina. Esta corta
 * en 200 filas y al asesor le filtraba solo por `assigned_to` (no veía a las personas de sus
 * procesos ni de sus tasaciones). No se borra: la cubren tests y la puede pedir un script.
 * El POST sí está vivo (alta de contacto y `ContactEditor`).
 */
export async function GET(request: NextRequest) {
  // Cierra el dump anónimo de PII de contactos (service-role bypassa RLS).
  const user = await requireAuth()
  // Un rol sin alcance de contactos (abogado, agent, viewer, uno nuevo) recibe 403; antes
  // recibía 200 con la lista acotada a su id. Ninguna pantalla suya pide esta ruta.
  if (alcanceContactos(user.profile.role) === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    const { searchParams } = new URL(request.url)
    // El alcance NO se decide en el navegador: quien no tiene `pipeline.view_all`
    // queda forzado a sus propios contactos, se ignore lo que venga en la dirección.
    const assigned_to = resolverAlcanceAsignado(
      user.profile.role,
      user.profile.id || user.id,
      searchParams.get('assigned_to'),
    )
    const origin = searchParams.get('origin') || undefined
    const from = searchParams.get('from') || undefined
    const to = searchParams.get('to') || undefined
    const data = await getContacts({ assigned_to, origin, from, to })
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Cierra la inyección anónima de contactos.
  const user = await requireAuth()
  const alcance = alcanceContactos(user.profile.role)
  if (alcance === 'ninguno') return NextResponse.json(SIN_ACCESO, { status: 403 })
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'El pedido no se entiende.' }, { status: 400 })
    }
    // Lista cerrada: antes el cuerpo crudo iba al insert (se podía colar `created_by`).
    const saneado = sanearDatosContacto(body, {
      modo: 'crear',
      puedeReasignar: puedeReasignarContacto(user.profile.role),
    })
    if (!saneado.ok) return NextResponse.json({ error: saneado.error }, { status: 400 })
    const { full_name, ...resto } = saneado.cambios
    if (!full_name) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 })
    if (resto.assigned_to && !(await existePerfil(resto.assigned_to))) {
      return NextResponse.json({ error: 'Ese usuario no existe.' }, { status: 400 })
    }
    // `created_by` lo pone SIEMPRE el servidor. El asesor queda dueño de lo que crea:
    // así, después, `ContactEditor` puede vincularlo a su proceso (tarea 5.4).
    const id = await createContact({
      full_name,
      ...resto,
      created_by: user.id,
      ...(alcance === 'propios' ? { assigned_to: user.id } : {}),
    })
    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error('POST /api/contacts error:', error)
    return NextResponse.json({ error: 'No se pudo guardar. Probá de nuevo.' }, { status: 500 })
  }
}
