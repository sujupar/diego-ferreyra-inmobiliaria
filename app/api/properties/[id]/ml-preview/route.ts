import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { propertyToMlPayload } from '@/lib/portals/mercadolibre/mapping'
import { validateCommon } from '@/lib/portals/validation'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function authorize(propertyId: string, userId: string, role: string) {
  if (role === 'abogado') return false // El abogado no participa de marketing
  if (role !== 'asesor') return true
  const supabase = getAdmin()
  const { data } = await supabase
    .from('properties')
    .select('assigned_to')
    .eq('id', propertyId)
    .single()
  return data?.assigned_to === userId
}

/**
 * GET → devuelve { property, payload, validation } para el wizard de ML.
 *   - property: campos editables actuales (title, description, photos, asking_price)
 *   - payload: lo que vamos a mandar a MercadoLibre tal cual está hoy
 *   - validation: errores y warnings del adapter
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = getAdmin()
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !property) {
      return NextResponse.json({ error: 'property not found' }, { status: 404 })
    }

    // Estado actual del listing ML (si ya se publicó alguna vez).
    // El wizard usa esto para mostrar modo "preview/publish" vs "gestionar".
    const { data: listing } = await supabase
      .from('property_listings')
      .select('status, external_id, external_url, last_published_at, last_error')
      .eq('property_id', id)
      .eq('portal', 'mercadolibre')
      .maybeSingle()

    // El payload exige lat/lng — si no hay, devolvemos solo validation
    if (property.latitude == null || property.longitude == null) {
      return NextResponse.json({
        property,
        payload: null,
        validation: {
          ok: false,
          errors: ['Falta geolocalización (lat/lng) — completar en la ficha antes de publicar'],
          warnings: [],
        },
        listing: listing ?? null,
      })
    }

    const payload = propertyToMlPayload(property)
    const validation = validateCommon(property)
    // ML requiere descripción ≥ 100 chars
    if (!property.description || property.description.length < 100) {
      validation.errors.push('ML requiere descripción ≥ 100 caracteres')
      validation.ok = false
    }

    return NextResponse.json({ property, payload, validation, listing: listing ?? null })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

/**
 * PATCH → actualiza campos editables de la propiedad desde el wizard.
 * Solo permite editar: title, description, photos (reordenadas), asking_price.
 * Devuelve el payload y validation recalculados.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = (await req.json()) as {
      title?: string
      description?: string
      photos?: string[]
      asking_price?: number
    }

    const update: Record<string, unknown> = {}
    if (typeof body.title === 'string') update.title = body.title.slice(0, 60)
    if (typeof body.description === 'string') {
      // ML soporta hasta ~50k chars; nuestro UI usa textarea de ~6 filas. Limitamos.
      update.description = body.description.slice(0, 5000)
    }
    if (Array.isArray(body.photos)) {
      // Validar que sean strings URL válidas y limitar a 12 (límite ML).
      const cleaned = body.photos
        .filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 2000)
        .filter(p => /^https?:\/\//i.test(p))
        .slice(0, 12)
      update.photos = cleaned
    }
    if (typeof body.asking_price === 'number' && body.asking_price > 0) {
      // Cap razonable: USD 100M es más que cualquier propiedad real.
      update.asking_price = Math.min(body.asking_price, 100_000_000)
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }

    const supabase = getAdmin()
    const { data: property, error } = await supabase
      .from('properties')
      .update(update)
      .eq('id', id)
      .select()
      .single()
    if (error || !property) {
      return NextResponse.json({ error: error?.message ?? 'update failed' }, { status: 500 })
    }

    let payload = null
    if (property.latitude != null && property.longitude != null) {
      payload = propertyToMlPayload(property)
    }
    const validation = validateCommon(property)
    if (!property.description || property.description.length < 100) {
      validation.errors.push('ML requiere descripción ≥ 100 caracteres')
      validation.ok = false
    }

    return NextResponse.json({ property, payload, validation })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
