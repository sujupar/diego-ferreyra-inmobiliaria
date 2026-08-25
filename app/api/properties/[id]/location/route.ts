/**
 * PATCH /api/properties/[id]/location — corrige la ubicación de la propiedad
 * con una selección hecha SOBRE el catálogo de Argenprop.
 *
 * Ruta dedicada y no el `PUT /api/properties/[id]` genérico: aquel toma el body
 * entero (cualquier columna viajaría desde el navegador) y además crea tarea y
 * manda mail al pasar a `pending_review`. Acá solo entran las cuatro columnas
 * que devuelve `resolverUbicacion`, que valida la forma de cada identificador.
 *
 * No dispara geocodificación: `geocodePropertyBestEffort` solo pone el pin
 * cuando está vacío y prefiere la provincia guardada, así que corregir la
 * ubicación no mueve un pin que alguien ya ajustó a mano.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
import { getProperty, updateProperty } from '@/lib/supabase/properties'
import { resolverUbicacion, type SeleccionUbicacion } from '@/lib/properties/location-selection'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = (await request.json().catch(() => null)) as { seleccion?: SeleccionUbicacion } | null
    const actual = await getProperty(id).catch(() => null)
    if (!actual) return NextResponse.json({ error: 'No se encontró la propiedad.' }, { status: 404 })

    const resuelta = resolverUbicacion(body?.seleccion as SeleccionUbicacion, {
      province: actual.province as string | null,
      city: actual.city as string | null,
      neighborhood: actual.neighborhood as string | null,
    })
    if (!resuelta.ok) {
      return NextResponse.json({ error: resuelta.error }, { status: 400 })
    }

    await updateProperty(id, resuelta.patch as never)
    const property = await getProperty(id)
    return NextResponse.json({ success: true, property })
  } catch (error) {
    console.error('PATCH /api/properties/[id]/location error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo guardar la ubicación.' },
      { status: 500 },
    )
  }
}
