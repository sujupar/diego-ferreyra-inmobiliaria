import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { resolveCategory, ML_LISTING_TYPES } from '@/lib/portals/mercadolibre/mapping'
import { fetchCategoryAttributes, type AttributeOverride } from '@/lib/portals/mercadolibre/category-attributes'
import type { Database } from '@/types/database.types'

type PropertyRow = Database['public']['Tables']['properties']['Row']

function getAdmin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function derivedPrefill(property: PropertyRow): Record<string, AttributeOverride> {
  const out: Record<string, AttributeOverride> = {}
  if (property.rooms) out.ROOMS = { value_name: String(property.rooms) }
  if (property.bedrooms) out.BEDROOMS = { value_name: String(property.bedrooms) }
  if (property.bathrooms) out.FULL_BATHROOMS = { value_name: String(property.bathrooms) }
  if (property.garages) out.PARKING_LOTS = { value_name: String(property.garages) }
  // number_unit: ML exige unidad explícita (sino rechaza el aviso). Mismo formato que derivedAttributes.
  if (property.covered_area) out.COVERED_AREA = { value_name: `${property.covered_area} m²` }
  if (property.total_area) out.TOTAL_AREA = { value_name: `${property.total_area} m²` }
  if (property.expensas) out.MAINTENANCE_FEE = { value_name: `${property.expensas} ARS` }
  if (property.age != null) out.PROPERTY_AGE = { value_name: property.age === 0 ? 'A estrenar' : `${property.age} años` }
  if (property.floor != null) out.FLOORS = { value_name: String(property.floor) }
  return out
}

/** GET → schema dinámico de atributos de ML + valores prellenos (propiedad + draft). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const { id } = await params
    const supabase = getAdmin()

    const { data: property } = await supabase.from('properties').select('*').eq('id', id).maybeSingle()
    if (!property) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (user.profile.role === 'asesor' && property.assigned_to !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const categoryId = resolveCategory(property)
    const { required, recommended } = await fetchCategoryAttributes(categoryId)

    const { data: listing } = await supabase
      .from('property_listings')
      .select('metadata')
      .eq('property_id', id).eq('portal', 'mercadolibre').maybeSingle()
    const meta = (listing?.metadata ?? {}) as Record<string, unknown>
    const saved = (meta.ml_attributes ?? {}) as Record<string, AttributeOverride>

    const prefill: Record<string, AttributeOverride> = {
      ...derivedPrefill(property),
      ...saved, // lo guardado pisa lo derivado
    }

    return NextResponse.json({
      categoryId,
      required,
      recommended,
      prefill,
      listingTypes: ML_LISTING_TYPES,
      listingTypeSelected: (meta.listing_type as string) ?? 'gold_premium',
      mediaChoice: (meta.media_choice as string) ?? 'none',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
