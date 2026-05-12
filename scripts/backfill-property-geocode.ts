/**
 * Backfill latitude/longitude para propiedades sin geolocalización.
 *
 * Uso:
 *   GOOGLE_GEOCODING_API_KEY=... npm exec tsx scripts/backfill-property-geocode.ts
 *
 * Lee properties.latitude IS NULL, geocodea con Google Maps Geocoding API
 * (region=ar), y guarda lat/lng. Rate limit: 100ms entre llamadas.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const GOOGLE_KEY = process.env.GOOGLE_GEOCODING_API_KEY

interface GeocodeResult {
  results: Array<{
    geometry: { location: { lat: number; lng: number } }
    formatted_address: string
  }>
  status: string
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_KEY) throw new Error('GOOGLE_GEOCODING_API_KEY missing')
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', address)
  url.searchParams.set('key', GOOGLE_KEY)
  url.searchParams.set('region', 'ar')
  const res = await fetch(url.toString())
  const json = (await res.json()) as GeocodeResult
  if (json.status !== 'OK' || !json.results?.[0]) return null
  return json.results[0].geometry.location
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, address, neighborhood, city')
    .is('latitude', null)

  if (error) {
    console.error('Failed to fetch properties:', error.message)
    process.exit(1)
  }
  if (!properties || properties.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  console.log(`Backfilling ${properties.length} properties`)

  let ok = 0
  let miss = 0
  for (const p of properties) {
    const fullAddress = `${p.address}, ${p.neighborhood}, ${p.city ?? 'CABA'}, Argentina`
    const coords = await geocode(fullAddress)
    if (!coords) {
      console.warn(`✗ No coords for ${p.id} (${fullAddress})`)
      miss++
      continue
    }
    const { error: updErr } = await supabase
      .from('properties')
      .update({ latitude: coords.lat, longitude: coords.lng })
      .eq('id', p.id)
    if (updErr) {
      console.error(`✗ Update failed ${p.id}:`, updErr.message)
      miss++
      continue
    }
    console.log(`✓ ${p.id} → ${coords.lat}, ${coords.lng}`)
    ok++
    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\nDone. ${ok} updated, ${miss} missed.`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
