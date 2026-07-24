/**
 * Geocoder con fallback: Google Geocoding API si hay GOOGLE_GEOCODING_API_KEY,
 * si no OpenStreetMap/Nominatim (gratis). Nunca lanza por falta de key.
 * Devuelve un `confidence` para que el asesor sepa cuándo verificar el pin.
 *
 * Nota Nominatim: 1 req/s + User-Agent obligatorio. Este módulo geocodifica 1x
 * por acción; el backfill serializa con throttle. NO llamar en loops sin throttle.
 */

export type GeoConfidence = 'high' | 'medium' | 'low'

export interface GeocodeExpected {
  province?: string | null   // 'CABA' | 'Buenos Aires' | ...
  locality?: string | null   // barrio (CABA) o partido/localidad (GBA)
  number?: string | null     // altura esperada
  isCaba?: boolean
}

export interface GeocodeResult {
  lat: number
  lng: number
  formatted: string
  confidence: GeoConfidence
  provider: 'google' | 'osm'
}

const LEVELS: GeoConfidence[] = ['low', 'medium', 'high']
function minConf(a: GeoConfidence, b: GeoConfidence): GeoConfidence {
  return LEVELS[Math.min(LEVELS.indexOf(a), LEVELS.indexOf(b))]
}
function downgrade(c: GeoConfidence): GeoConfidence {
  return LEVELS[Math.max(0, LEVELS.indexOf(c) - 1)]
}
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
function expectsProvinceCaba(e?: GeocodeExpected): boolean {
  return !!(e?.isCaba || (e?.province && /caba|capital federal|ciudad aut/i.test(e.province)))
}

// ---------- Google ----------
interface GoogleResult {
  geometry: { location: { lat: number; lng: number }; location_type: string }
  formatted_address: string
  partial_match?: boolean
  address_components: Array<{ long_name: string; short_name: string; types: string[] }>
}

async function geocodeGoogle(query: string, key: string, expected?: GeocodeExpected): Promise<GeocodeResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=ar&key=${key}`
  const res = await fetch(url)
  const data = (await res.json()) as { status: string; results: GoogleResult[] }
  if (data.status !== 'OK' || !data.results?.[0]) return null
  const r = data.results[0]

  // Guarda de región (hard): rechaza cross-provincia.
  const adminL1 = r.address_components.find(c => c.types.includes('administrative_area_level_1'))
  const isResultCaba = !!adminL1 && /ciudad aut|caba|capital federal/i.test(`${adminL1.long_name} ${adminL1.short_name}`)
  if (expectsProvinceCaba(expected) && !isResultCaba) return null
  if (expected?.province && !expectsProvinceCaba(expected) && adminL1) {
    // provincia esperada no-CABA (ej. Buenos Aires) y el resultado no la contiene → rechazar
    if (norm(adminL1.long_name).indexOf(norm(expected.province)) === -1) return null
  }

  // Confianza base por location_type.
  let conf: GeoConfidence =
    r.geometry.location_type === 'ROOFTOP' ? 'high'
    : r.geometry.location_type === 'RANGE_INTERPOLATED' ? 'medium'
    : 'low'
  if (r.partial_match) conf = downgrade(conf)

  // Chequeo de altura: si Google devolvió street_number distinto, baja a low.
  if (expected?.number) {
    const sn = r.address_components.find(c => c.types.includes('street_number'))
    if (sn && norm(sn.long_name) !== norm(expected.number)) conf = 'low'
  }

  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address, confidence: conf, provider: 'google' }
}

// ---------- OSM / Nominatim ----------
interface OsmResult {
  lat: string
  lon: string
  display_name: string
  class?: string
  type?: string
  address?: Record<string, string>
}

async function geocodeOsm(query: string, expected?: GeocodeExpected): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=ar&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'DiegoFerreyraInmobiliaria/1.0 (contacto@inmodf.com.ar)' } })
  const data = (await res.json()) as OsmResult[]
  const r = data?.[0]
  if (!r) return null

  const addr = r.address ?? {}
  const state = norm(addr.state ?? '')
  const resultIsCaba = /ciudad autonoma|capital federal/.test(state)

  // Guarda de región (hard).
  if (expectsProvinceCaba(expected) && !resultIsCaba) return null
  if (expected?.province && !expectsProvinceCaba(expected)) {
    // Provincia esperada no-CABA (ej. Buenos Aires): el state debe contenerla y NO ser CABA.
    if (resultIsCaba || (state && state.indexOf(norm(expected.province)) === -1)) return null
  }

  // Confianza base por class/type.
  let conf: GeoConfidence =
    (r.class === 'place' && r.type === 'house') || r.type === 'building' ? 'high'
    : (r.class === 'highway' || r.type === 'residential' || r.type === 'road') ? 'medium'
    : 'low'

  // Chequeo de altura (señal principal de mal-match: 11 vs 2537, 69 vs 3500).
  if (expected?.number) {
    if (addr.house_number && norm(addr.house_number) !== norm(expected.number)) conf = 'low'
    else if (!addr.house_number) conf = minConf(conf, 'medium')
  }

  // Chequeo de localidad (soft): si no aparece por ningún lado, baja un nivel.
  if (expected?.locality) {
    const hay = norm([addr.suburb, addr.city_district, addr.city, addr.town, addr.village, addr.county, addr.municipality, addr.state].filter(Boolean).join(' '))
    if (hay && hay.indexOf(norm(expected.locality)) === -1) conf = downgrade(conf)
  }

  return { lat: Number(r.lat), lng: Number(r.lon), formatted: r.display_name, confidence: conf, provider: 'osm' }
}

export async function geocodeAddress(query: string, expected?: GeocodeExpected): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_GEOCODING_API_KEY
  if (key) {
    try {
      const g = await geocodeGoogle(query, key, expected)
      if (g) return g
    } catch { /* cae a OSM */ }
  }
  try {
    return await geocodeOsm(query, expected)
  } catch {
    return null
  }
}
