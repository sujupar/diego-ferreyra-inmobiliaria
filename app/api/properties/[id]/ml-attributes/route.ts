import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { resolveCategory, mensajeSinCategoria, ML_LISTING_TYPES } from '@/lib/portals/mercadolibre/mapping'
import { fetchCategoryAttributes, type AttributeOverride } from '@/lib/portals/mercadolibre/category-attributes'
import { derivedPrefill } from '@/lib/portals/mercadolibre/prefill'
import { fetchAvailableListingTypes } from '@/lib/portals/mercadolibre/listing-types'
import { resolverIdsDeLista } from '@/lib/portals/datos-visita'
import type { Database } from '@/types/database.types'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'

function getAdmin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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
    // Se pasa la propiedad YA leída: sin esto se consultaría dos veces por request.
    if (!(await puedeDifundir(id, user.id, user.profile.role, 'difundir', property))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const categoryId = resolveCategory(property)
    if (!categoryId) {
      return NextResponse.json({ error: mensajeSinCategoria(property) }, { status: 400 })
    }
    const { required, recommended } = await fetchCategoryAttributes(categoryId)

    const { data: listing } = await supabase
      .from('property_listings')
      .select('metadata')
      .eq('property_id', id).eq('portal', 'mercadolibre').maybeSingle()
    const meta = (listing?.metadata ?? {}) as Record<string, unknown>
    const saved = (meta.ml_attributes ?? {}) as Record<string, AttributeOverride>

    // Orden de prioridad: columnas de la propiedad < lo cargado en la VISITA
    // (portal_data.ml, 2026-09-14) < el borrador del wizard. Los derivados de
    // la visita traen listas por nombre; se resuelven a id contra el schema
    // para que el select los muestre elegidos.
    const deLaVisita = resolverIdsDeLista(
      (((property.portal_data ?? {}) as { ml?: Record<string, AttributeOverride> }).ml ?? {}),
      [...required, ...recommended],
    )
    const prefill: Record<string, AttributeOverride> = {
      ...derivedPrefill(property),
      ...deLaVisita,
      ...saved, // lo guardado pisa lo derivado
    }

    // Tipos de publicación REALMENTE disponibles para la cuenta en esta categoría
    // (varía por categoría: depto/casa suelen tener solo 'silver', PH 'free', etc.).
    let listingTypes: { id: string; label: string }[]
    let defaultTier: string
    try {
      const avail = await fetchAvailableListingTypes(categoryId)
      listingTypes = avail.map(t => ({
        id: t.id,
        label: t.remaining != null ? `${t.name} (${t.remaining} disponibles)` : t.name,
      }))
      defaultTier = avail[0]?.id ?? 'free' // el más barato disponible
    } catch {
      listingTypes = ML_LISTING_TYPES
      defaultTier = 'free'
    }
    const savedTier = meta.listing_type as string | undefined
    const listingTypeSelected =
      savedTier && listingTypes.some(t => t.id === savedTier) ? savedTier : defaultTier

    return NextResponse.json({
      categoryId,
      required,
      recommended,
      prefill,
      listingTypes,
      listingTypeSelected,
      mediaChoice: (meta.media_choice as string) ?? 'none',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
