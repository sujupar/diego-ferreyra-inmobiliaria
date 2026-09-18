import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessDeal } from '@/lib/auth/entity-access'
import { camposFaltantes, puedeReasignarAsesor, validarDatosCliente, ORIGENES_MANUALES } from '@/lib/deals/proceso-manual'
import { esAsesorAsignable } from '@/lib/deals/asesor-asignable'
import { encontrarOCrearContacto } from '@/lib/supabase/contactos'
import { leerDatosDelProceso } from '@/lib/deals/datos-cliente'

type Contacto = { id: string; full_name: string | null; phone: string | null; email: string | null }

/**
 * PUT /api/deals/[id]/cliente — completa los datos del cliente de un proceso
 * (nombre, teléfono, email y, si falta, asesor) en un solo pedido.
 *
 * Es lo que guarda la ventana "Completá los datos del cliente para avanzar"
 * (2026-09-18): desde entonces ningún proceso avanza sin esos datos, y los que
 * quedaron a medias se completan justo cuando alguien los quiere mover.
 *
 * Qué contacto se escribe, pensando en un teléfono mal tipeado:
 *  - Si el proceso YA tiene contacto, se corrige ese: es el mismo cliente.
 *  - Si no tiene, se busca a la persona (email / teléfono) y se la vincula,
 *    completando SOLO los campos que le faltan o están mal. Nunca se pisan los
 *    datos buenos de un contacto que ya existía: un número equivocado no puede
 *    renombrar a otra persona.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (!(await canAccessDeal(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: dealData } = await db
      .from('deals')
      .select('id, contact_id, property_address, assigned_to, origin')
      .eq('id', id)
      .maybeSingle()
    const deal = dealData as { contact_id: string | null; property_address: string | null; assigned_to: string | null; origin: string | null } | null
    if (!deal) return NextResponse.json({ error: 'Proceso no encontrado' }, { status: 404 })

    const cliente = validarDatosCliente(
      { nombre: body?.nombre, telefono: body?.telefono, email: body?.email },
      deal.property_address,
    )
    const asesorPedido = typeof body?.asesorId === 'string' ? body.asesorId.trim() : ''
    const errores = cliente.ok ? [] : [...cliente.errores]
    if (!deal.assigned_to && !asesorPedido) errores.push('Elegí el asesor: sin asesor el proceso no le aparece en su CRM.')
    if (!cliente.ok || errores.length > 0) {
      return NextResponse.json({ error: errores.join(' '), errores }, { status: 400 })
    }

    const cambiaAsesor = !!asesorPedido && asesorPedido !== deal.assigned_to
    if (cambiaAsesor) {
      if (!puedeReasignarAsesor(user.profile.role)) {
        return NextResponse.json({ error: 'Solo un coordinador, dueño o admin puede cambiar el asesor de un proceso.' }, { status: 403 })
      }
      if (!(await esAsesorAsignable(db, asesorPedido))) {
        return NextResponse.json({ error: 'Ese usuario no puede tener procesos asignados (tiene que ser un asesor activo).' }, { status: 400 })
      }
    }

    const { nombre, telefono, email } = cliente.valor
    const ahora = new Date().toISOString()
    let contactId: string

    if (deal.contact_id) {
      // El contacto de ESTE proceso: se corrige entero.
      contactId = deal.contact_id
      const { error } = await db.from('contacts')
        .update({ full_name: nombre, phone: telefono, email, updated_at: ahora })
        .eq('id', contactId)
      if (error) throw new Error(error.message)
    } else {
      const origen = (ORIGENES_MANUALES as readonly string[]).includes(deal.origin ?? '') ? deal.origin : null
      contactId = await encontrarOCrearContacto({
        nombre, telefono, email, origen,
        asesorId: cambiaAsesor ? asesorPedido : deal.assigned_to,
      })
      // Si ya existía, se completan SOLO sus huecos (o lo que tiene mal).
      const { data: actual } = await db.from('contacts').select('id, full_name, phone, email').eq('id', contactId).maybeSingle()
      const c = actual as Contacto | null
      if (c) {
        const huecos = camposFaltantes({
          contactoNombre: c.full_name, contactoTelefono: c.phone, contactoEmail: c.email,
          propertyAddress: deal.property_address, assignedTo: 'no-aplica',
        })
        const parche: Record<string, string> = {}
        if (huecos.includes('nombre')) parche.full_name = nombre
        if (huecos.includes('telefono')) parche.phone = telefono
        if (huecos.includes('email')) parche.email = email
        if (Object.keys(parche).length > 0) {
          const { error } = await db.from('contacts').update({ ...parche, updated_at: ahora }).eq('id', contactId)
          if (error) throw new Error(error.message)
        }
      }
    }

    const cambiosDelProceso: Record<string, string> = {}
    if (deal.contact_id !== contactId) cambiosDelProceso.contact_id = contactId
    if (cambiaAsesor) cambiosDelProceso.assigned_to = asesorPedido
    if (Object.keys(cambiosDelProceso).length > 0) {
      const { error } = await db.from('deals').update({ ...cambiosDelProceso, updated_at: ahora }).eq('id', id)
      if (error) throw new Error(error.message)
    }

    // Se relee: la pantalla reintenta el avance solo si de verdad quedó completo.
    const despues = await leerDatosDelProceso(id)
    return NextResponse.json({ ok: true, contactId, faltan: despues?.faltan ?? [] })
  } catch (error) {
    console.error('PUT /api/deals/[id]/cliente:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
