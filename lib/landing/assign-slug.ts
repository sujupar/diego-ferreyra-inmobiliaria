import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { propertyToSlug } from './slug'

const MAX_RETRIES = 5

/**
 * Asigna un public_slug único a una propiedad si todavía no lo tiene.
 * Idempotente: si ya tiene slug, retorna el existente.
 *
 * Estrategia: genera slug → UPDATE WHERE public_slug IS NULL (atomic).
 * Si choca con UNIQUE constraint (colisión random), reintenta hasta 5 veces
 * con un random suffix nuevo.
 */
export async function ensurePublicSlug(
  supabase: SupabaseClient<Database>,
  propertyId: string,
): Promise<string> {
  const { data: property, error: getErr } = await supabase
    .from('properties')
    .select('id, address, neighborhood, property_type, public_slug')
    .eq('id', propertyId)
    .single()
  if (getErr || !property) throw new Error(`Property ${propertyId} not found`)
  if (property.public_slug) return property.public_slug

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const slug = propertyToSlug(property)
    const { data: updated, error: updErr } = await supabase
      .from('properties')
      .update({ public_slug: slug })
      .eq('id', propertyId)
      .is('public_slug', null)
      .select('public_slug')
      .maybeSingle()

    if (!updErr && updated?.public_slug) return updated.public_slug
    if (updErr && !isUniqueViolation(updErr.message)) throw updErr

    // Si el UPDATE no impactó filas (otro proceso le ganó), refetch
    if (!updErr && !updated) {
      const { data: refetched } = await supabase
        .from('properties')
        .select('public_slug')
        .eq('id', propertyId)
        .single()
      if (refetched?.public_slug) return refetched.public_slug
    }
  }
  throw new Error(`Could not assign unique slug after ${MAX_RETRIES} attempts`)
}

function isUniqueViolation(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('unique') || lower.includes('duplicate key')
}
