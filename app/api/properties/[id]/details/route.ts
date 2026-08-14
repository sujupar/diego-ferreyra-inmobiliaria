import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
import { updateProperty, getProperty } from '@/lib/supabase/properties'
import { sanearEdicion } from '@/lib/properties/editable-fields'

/**
 * PATCH /api/properties/[id]/details — edición de datos de la propiedad desde
 * su ficha (hoy: precio y moneda).
 *
 * Ruta propia y NO el `PUT /api/properties/[id]` genérico: aquel acepta
 * cualquier columna que venga en el body. Acá solo pasa lo que aprueba
 * `sanearEdicion` (lista blanca testeada).
 *
 * La landing pública NO necesita nada: lee el precio en vivo desde `properties`
 * (`lib/landing/registry.tsx`) y se sirve sin caché, así que el cambio aparece
 * en el siguiente refresh. Los avisos ya publicados en los portales SÍ quedan
 * con el precio viejo — la UI lo advierte; republicarlos es una acción aparte.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    // El abogado no ve ni toca datos comerciales (mismo criterio que la ficha).
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const saneado = sanearEdicion(await request.json().catch(() => null))
    if (!saneado.ok) {
      return NextResponse.json({ error: saneado.error }, { status: 400 })
    }

    await updateProperty(id, saneado.patch)
    const property = await getProperty(id)
    return NextResponse.json({ success: true, property })
  } catch (error) {
    console.error('PATCH /api/properties/[id]/details error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo guardar el cambio.' },
      { status: 500 },
    )
  }
}
