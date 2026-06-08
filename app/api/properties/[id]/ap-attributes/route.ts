import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { getApSchema, derivedPrefill, type AttributeOverride } from '@/lib/portals/argenprop/field-schema'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** GET → schema estático de Argenprop + valores prellenos (propiedad + draft). */
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

    const schema = getApSchema(property)

    const { data: listing } = await supabase
      .from('property_listings')
      .select('metadata')
      .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
    const meta = (listing?.metadata ?? {}) as Record<string, unknown>
    const saved = (meta.ap_attributes ?? {}) as Record<string, AttributeOverride>

    const prefill: Record<string, AttributeOverride> = { ...derivedPrefill(property), ...saved }

    return NextResponse.json({
      categoryId: schema.categoryId,
      required: schema.required,
      recommended: schema.recommended,
      prefill,
      // Tier diferido: una sola opción "Estándar" para mantener la UI idéntica a ML.
      listingTypes: [{ id: 'estandar', label: 'Estándar' }],
      listingTypeSelected: (meta.listing_type as string) ?? 'estandar',
      mediaChoice: (meta.media_choice as string) ?? 'none',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
