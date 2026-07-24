import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { parseAddress, buildGeocodeQuery, deriveProvince } from './address'
import { geocodeAddress } from './geocoder'

/**
 * Geocodifica una propiedad recién creada/editada de forma best-effort.
 * Solo setea lat/lng si están en null (no pisa un pin existente). NUNCA lanza.
 */
export async function geocodePropertyBestEffort(propertyId: string): Promise<void> {
  try {
    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: p } = await supabase
      .from('properties')
      .select('id, address, neighborhood, city, province, latitude, longitude')
      .eq('id', propertyId).single()
    if (!p || !p.address || p.latitude != null) return
    const province = p.province ?? deriveProvince({ address: p.address, city: p.city }) ?? null
    const parts = parseAddress(p.address, { neighborhood: p.neighborhood, city: p.city, province })
    const r = await geocodeAddress(buildGeocodeQuery(parts), {
      province: parts.province, locality: parts.isCaba ? parts.neighborhood : parts.locality,
      number: parts.number, isCaba: parts.isCaba,
    })
    if (!r) return
    await supabase.from('properties').update({
      latitude: r.lat, longitude: r.lng, province: parts.province,
      geo_confidence: r.confidence, geocoded_at: new Date().toISOString(),
    }).eq('id', propertyId).is('latitude', null)
  } catch (err) {
    console.warn('[geocode-on-write] best-effort falló (continuando):', err)
  }
}
