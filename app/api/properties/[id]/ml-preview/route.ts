import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { propertyToMlPayload, resolveCategory } from '@/lib/portals/mercadolibre/mapping'
import { fetchCategoryAttributes } from '@/lib/portals/mercadolibre/category-attributes'
import { validateCommon } from '@/lib/portals/validation'
import type { Database } from '@/types/database.types'

type PropertyRow = Database['public']['Tables']['properties']['Row']

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
 * Construye el payload de ML + validación, usando el draft guardado en
 * property_listings.metadata (atributos/medios/listingType) y filtrando los
 * atributos contra el schema dinámico de la categoría.
 */
async function buildPayloadAndValidation(
  supabase: ReturnType<typeof getAdmin>,
  propertyId: string,
  property: PropertyRow,
) {
  if (property.latitude == null || property.longitude == null) {
    return {
      payload: null,
      validation: {
        ok: false,
        errors: ['Falta geolocalización (lat/lng) — confirmá el pin en el mapa'],
        warnings: [] as string[],
      },
    }
  }
  const { data: listing } = await supabase
    .from('property_listings').select('metadata')
    .eq('property_id', propertyId).eq('portal', 'mercadolibre').maybeSingle()
  const meta = (listing?.metadata ?? {}) as Record<string, unknown>

  let allowedAttributeIds: Set<string> | undefined
  try {
    const cat = resolveCategory(property)
    const { required, recommended } = await fetchCategoryAttributes(cat)
    allowedAttributeIds = new Set([...required, ...recommended].map(a => a.id))
  } catch {
    allowedAttributeIds = undefined // si ML falla, no filtramos
  }

  const payload = propertyToMlPayload(property, {
    attributeOverrides: (meta.ml_attributes ?? {}) as Record<string, { value_name?: string; value_id?: string }>,
    mediaChoice: (meta.media_choice as 'video' | 'tour' | 'none') ?? 'none',
    listingType: (meta.listing_type as string) ?? 'gold_premium',
    allowedAttributeIds,
  })
  const validation = validateCommon(property)
  if (!property.description || property.description.length < 100) {
    validation.errors.push('ML requiere descripción ≥ 100 caracteres')
    validation.ok = false
  }
  return { payload, validation }
}

/**
 * GET → { property, payload, validation, listing, draft } para el wizard de ML.
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

    const { data: listing } = await supabase
      .from('property_listings')
      .select('status, external_id, external_url, last_published_at, last_error, metadata')
      .eq('property_id', id)
      .eq('portal', 'mercadolibre')
      .maybeSingle()

    const { payload, validation } = await buildPayloadAndValidation(supabase, id, property)

    return NextResponse.json({
      property,
      payload,
      validation,
      listing: listing ?? null,
      draft: (listing?.metadata ?? {}) as Record<string, unknown>,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

/**
 * PATCH → actualiza campos editables de la propiedad + el draft de publicación.
 * Propiedad: title, description, photos, asking_price, video_url, tour_3d_url, latitude, longitude.
 * Draft (property_listings.metadata): ml_attributes, media_choice, listing_type.
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
      videoUrl?: string | null
      tour3dUrl?: string | null
      latitude?: number
      longitude?: number
      mlAttributes?: Record<string, { value_name?: string; value_id?: string }>
      mediaChoice?: 'video' | 'tour' | 'none'
      listingType?: string
    }

    const supabase = getAdmin()

    // 1) Campos de la propiedad
    const update: Record<string, unknown> = {}
    if (typeof body.title === 'string') update.title = body.title.slice(0, 60)
    if (typeof body.description === 'string') update.description = body.description.slice(0, 5000)
    if (Array.isArray(body.photos)) {
      update.photos = body.photos
        .filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 2000)
        .filter(p => /^https?:\/\//i.test(p))
        .slice(0, 12)
    }
    if (typeof body.asking_price === 'number' && body.asking_price > 0) {
      update.asking_price = Math.min(body.asking_price, 100_000_000)
    }
    if (body.videoUrl !== undefined) update.video_url = body.videoUrl
    if (body.tour3dUrl !== undefined) update.tour_3d_url = body.tour3dUrl
    if (typeof body.latitude === 'number') update.latitude = body.latitude
    if (typeof body.longitude === 'number') update.longitude = body.longitude

    let property: PropertyRow | null = null
    if (Object.keys(update).length > 0) {
      const { data, error } = await supabase.from('properties').update(update).eq('id', id).select().single()
      if (error || !data) return NextResponse.json({ error: error?.message ?? 'update failed' }, { status: 500 })
      property = data
    } else {
      const { data } = await supabase.from('properties').select('*').eq('id', id).single()
      property = data
    }
    if (!property) return NextResponse.json({ error: 'property not found' }, { status: 404 })

    // 2) Draft de publicación en property_listings.metadata
    const draftPatch: Record<string, unknown> = {}
    if (body.mlAttributes) draftPatch.ml_attributes = body.mlAttributes
    if (body.mediaChoice) draftPatch.media_choice = body.mediaChoice
    if (body.listingType) draftPatch.listing_type = body.listingType
    if (Object.keys(draftPatch).length > 0) {
      const { data: existing } = await supabase
        .from('property_listings').select('metadata')
        .eq('property_id', id).eq('portal', 'mercadolibre').maybeSingle()
      const mergedMeta = { ...((existing?.metadata as Record<string, unknown>) ?? {}), ...draftPatch }
      const row: Record<string, unknown> = { property_id: id, portal: 'mercadolibre', metadata: mergedMeta }
      if (!existing) row.status = 'pending'
      await supabase.from('property_listings').upsert(row as never, { onConflict: 'property_id,portal' })
    }

    // 3) Recalcular payload + validation con el draft completo
    const { payload, validation } = await buildPayloadAndValidation(supabase, id, property)
    return NextResponse.json({ property, payload, validation })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
