/**
 * Backfill de latitude/longitude/province/geo_confidence para propiedades sin geo.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/backfill-address-geocode.ts          # DRY-RUN (default)
 *   node --env-file=.env.local --import tsx scripts/backfill-address-geocode.ts --commit  # escribe
 *
 * - Solo toca filas con latitude IS NULL (nunca pisa un pin existente/manual).
 * - Recupera Zona/Provincia del CSV (col 13) para las importadas (match import_external_id).
 * - Geocodifica Google→OSM (usa GOOGLE_GEOCODING_API_KEY si está). Throttle 1.1s (Nominatim).
 * - Lista al final las de baja confianza para revisión manual.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'
import { parseAddress, buildGeocodeQuery, deriveProvince } from '../lib/properties/address'
import { geocodeAddress } from '../lib/properties/geocoder'

const COMMIT = process.argv.includes('--commit')

// Mapa import_external_id (ID Zonaprop) -> Zona/Provincia (col 13 del CSV).
function loadCsvZonaMap(): Map<string, string> {
  const map = new Map<string, string>()
  try {
    const text = readFileSync(new URL('./data/precaptadas.csv', import.meta.url), 'utf8')
    const rows = text.split(/\r?\n/)
    for (const line of rows.slice(1)) {
      if (!line.trim()) continue
      // Parser tolerante: col 2 = ID Zonaprop, col 13 = Zona/Provincia. Reusa el mismo
      // criterio de comillas que scripts/import-precaptadas.ts (split respetando "").
      const cells = splitCsvLine(line)
      const id = (cells[1] ?? '').trim()
      const zona = (cells[12] ?? '').trim()
      if (id) map.set(id, zona)
    }
  } catch (e) {
    console.warn('No se pudo leer precaptadas.csv (se deriva provincia del texto):', (e as Error).message)
  }
  return map
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (c === ',' && !inQ) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const zonaMap = loadCsvZonaMap()

  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, address, neighborhood, city, province, import_external_id')
    .is('latitude', null)
  if (error) { console.error('fetch error:', error.message); process.exit(1) }
  if (!properties?.length) { console.log('Nada para backfillear.'); return }

  console.log(`${COMMIT ? 'COMMIT' : 'DRY-RUN'} — ${properties.length} propiedades sin geo\n`)
  const buckets = { high: 0, medium: 0, low: 0, miss: 0 }
  const lows: string[] = []

  for (const p of properties) {
    const csvZona = p.import_external_id ? zonaMap.get(p.import_external_id) : undefined
    const province = p.province ?? deriveProvince({ address: p.address, city: p.city, csvZona }) ?? null
    const parts = parseAddress(p.address, { neighborhood: p.neighborhood, city: p.city, province })
    const query = buildGeocodeQuery(parts)
    const r = await geocodeAddress(query, {
      province: parts.province, locality: parts.isCaba ? parts.neighborhood : parts.locality,
      number: parts.number, isCaba: parts.isCaba,
    })
    await new Promise(res => setTimeout(res, 1100)) // throttle Nominatim

    if (!r) { buckets.miss++; console.log(`✗ MISS  ${p.id}  «${query}»`); continue }
    buckets[r.confidence]++
    if (r.confidence === 'low') lows.push(`${p.id}  «${query}»  → ${r.formatted}`)
    console.log(`${r.confidence === 'high' ? '✓' : '~'} ${r.confidence.padEnd(6)} ${r.provider.padEnd(6)} ${p.id}  ${r.lat.toFixed(5)},${r.lng.toFixed(5)}  «${query}»`)

    if (COMMIT) {
      const { error: uErr } = await supabase.from('properties').update({
        latitude: r.lat, longitude: r.lng, province: parts.province,
        geo_confidence: r.confidence, geocoded_at: new Date().toISOString(),
      }).eq('id', p.id).is('latitude', null) // guard: no pisar si alguien la geocodificó mientras tanto
      if (uErr) console.error(`  update error ${p.id}:`, uErr.message)
    }
  }

  console.log(`\nResumen: high=${buckets.high} medium=${buckets.medium} low=${buckets.low} miss=${buckets.miss}`)
  if (lows.length) {
    console.log(`\n⚠ Baja confianza (revisar el pin a mano en el wizard):`)
    for (const l of lows) console.log('  ' + l)
  }
  if (!COMMIT) console.log('\n(DRY-RUN — nada se escribió. Re-correr con --commit tras revisar.)')
}

main().catch(e => { console.error(e); process.exit(1) })
