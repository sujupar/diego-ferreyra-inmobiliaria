import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { validateCommon } from '@/lib/portals/validation'
import { getApSchema, derivedPrefill, type AttributeOverride } from '@/lib/portals/argenprop/field-schema'
import type { Database } from '@/types/database.types'

type PropertyRow = Database['public']['Tables']['properties']['Row']

function getAdmin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function authorize(propertyId: string, userId: string, role: string) {
  if (role === 'abogado') return false
  if (role !== 'asesor') return true
  const supabase = getAdmin()
  const { data } = await supabase.from('properties').select('assigned_to').eq('id', propertyId).single()
  return data?.assigned_to === userId
}

/** Valida la propiedad para Argenprop usando los overrides guardados. */
function validateForArgenprop(property: PropertyRow, meta: Record<string, unknown>) {
  const validation = validateCommon(property)
  // Los required del schema deben estar cubiertos por la propiedad o por un override.
  const schema = getApSchema(property)
  const prefill = { ...derivedPrefill(property), ...((meta.ap_attributes ?? {}) as Record<string, AttributeOverride>) }
  for (const f of schema.required) {
    const v = prefill[f.id]
    if (!v || (!v.value_id && !v.value_name)) {
      validation.errors.push(`Falta campo obligatorio de Argenprop: ${f.name}`)
      validation.ok = false
    }
  }
  return validation
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = getAdmin()
    const { data: property, error } = await supabase.from('properties').select('*').eq('id', id).single()
    if (error || !property) return NextResponse.json({ error: 'property not found' }, { status: 404 })

    const { data: listing } = await supabase
      .from('property_listings')
      .select('status, external_id, external_url, last_published_at, last_error, metadata')
      .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
    const meta = (listing?.metadata ?? {}) as Record<string, unknown>

    return NextResponse.json({
      property,
      payload: null, // Argenprop no previsualiza un payload tipado en la UI (form opaco)
      validation: validateForArgenprop(property, meta),
      listing: listing ?? null,
      draft: meta,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = (await req.json()) as {
      title?: string; description?: string; photos?: string[]; asking_price?: number
      videoUrl?: string | null; tour3dUrl?: string | null; latitude?: number; longitude?: number
      apAttributes?: Record<string, AttributeOverride>
      mediaChoice?: 'video' | 'tour' | 'none'; listingType?: string
    }
    const supabase = getAdmin()

    // 1) Campos de la propiedad (mismo set y saneo que ml-preview)
    const update: Record<string, unknown> = {}
    if (typeof body.title === 'string') update.title = body.title.slice(0, 60)
    if (typeof body.description === 'string') update.description = body.description.slice(0, 5000)
    if (Array.isArray(body.photos)) {
      update.photos = body.photos
        .filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 2000)
        .filter(p => /^https?:\/\//i.test(p))
        .slice(0, 20)
    }
    if (typeof body.asking_price === 'number' && body.asking_price > 0) {
      update.asking_price = Math.min(body.asking_price, 100_000_000)
    }
    // Validar esquema https:// antes de guardar: tour_3d_url se embebe como <iframe src>
    // y video_url se renderiza — un javascript:/data: sería XSS almacenado (también en
    // la landing pública app/p/[slug]). Mismo criterio que la ruta /media (CLAUDE.md).
    if (body.videoUrl !== undefined) {
      update.video_url = body.videoUrl === null || /^https:\/\//i.test(body.videoUrl) ? body.videoUrl : null
    }
    if (body.tour3dUrl !== undefined) {
      update.tour_3d_url = body.tour3dUrl === null || /^https:\/\//i.test(body.tour3dUrl) ? body.tour3dUrl : null
    }
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

    // 2) Draft en property_listings.metadata (status 'draft' — NO 'pending')
    const draftPatch: Record<string, unknown> = {}
    if (body.apAttributes) draftPatch.ap_attributes = body.apAttributes
    if (body.mediaChoice) draftPatch.media_choice = body.mediaChoice
    if (body.listingType) draftPatch.listing_type = body.listingType
    let meta: Record<string, unknown> = {}
    if (Object.keys(draftPatch).length > 0) {
      const { data: existing } = await supabase
        .from('property_listings').select('metadata')
        .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
      meta = { ...((existing?.metadata as Record<string, unknown>) ?? {}), ...draftPatch }
      const row: Record<string, unknown> = { property_id: id, portal: 'argenprop', metadata: meta }
      if (!existing) row.status = 'draft' // CRÍTICO: 'draft', no 'pending' (el worker solo toca 'pending')
      await supabase.from('property_listings').upsert(row as never, { onConflict: 'property_id,portal' })
    } else {
      const { data: existing } = await supabase
        .from('property_listings').select('metadata')
        .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
      meta = (existing?.metadata as Record<string, unknown>) ?? {}
    }

    return NextResponse.json({ property, payload: null, validation: validateForArgenprop(property, meta) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
