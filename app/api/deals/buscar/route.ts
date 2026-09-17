import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { resolverAlcanceAsignado } from '@/lib/auth/scope'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { combinarProcesosEncontrados, type ProcesoEncontrado } from '@/lib/deals/proceso-manual'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Lo que se busca de más largo: más que esto es un texto pegado, no una búsqueda. */
const MAX_TERMINO = 80

/**
 * Busca procesos para vincularles una tasación o una captación hecha a mano.
 *
 * Busca por dirección, por nombre del cliente y por teléfono. El alcance lo
 * decide el SERVIDOR: un asesor solo encuentra sus propios procesos, igual que
 * en el listado del CRM (`resolverAlcanceAsignado`).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const termino = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, MAX_TERMINO)
    if (termino.length < 3) return NextResponse.json({ data: [] })

    const alcance = resolverAlcanceAsignado(user.profile.role, user.profile.id || user.id, null)
    const supabase = getAdmin()
    const columnas = 'id, property_address, stage, origin, assigned_to, scheduled_date, contacts:contact_id ( full_name, phone )'

    // 1) Por dirección.
    let qDireccion = supabase.from('deals').select(columnas).ilike('property_address', `%${termino}%`)
    if (alcance) qDireccion = qDireccion.eq('assigned_to', alcance)
    const { data: porDireccion } = await qDireccion.order('created_at', { ascending: false }).limit(10)

    // 2) Por cliente: nombre o teléfono. El teléfono se compara por los últimos
    //    10 dígitos, como en toda la plataforma.
    const clave = ultimos10Digitos(termino)
    let qContactos = supabase.from('contacts').select('id')
    qContactos = clave ? qContactos.eq('phone_norm', clave) : qContactos.ilike('full_name', `%${termino}%`)
    const { data: contactos } = await qContactos.limit(20)
    const ids = (contactos ?? []).map(c => c.id as string)

    let porContacto: unknown[] = []
    if (ids.length > 0) {
      let qDeals = supabase.from('deals').select(columnas).in('contact_id', ids)
      if (alcance) qDeals = qDeals.eq('assigned_to', alcance)
      const { data } = await qDeals.order('created_at', { ascending: false }).limit(10)
      porContacto = data ?? []
    }

    const aFila = (d: Record<string, unknown>): ProcesoEncontrado => ({
      id: d.id as string,
      propertyAddress: (d.property_address as string) ?? null,
      contactoNombre: ((d.contacts as { full_name?: string } | null)?.full_name) ?? null,
      stage: d.stage as string,
      origin: (d.origin as string) ?? null,
    })

    const data = combinarProcesosEncontrados(
      (porDireccion ?? []).map(d => aFila(d as Record<string, unknown>)),
      (porContacto as Record<string, unknown>[]).map(aFila),
    )
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
