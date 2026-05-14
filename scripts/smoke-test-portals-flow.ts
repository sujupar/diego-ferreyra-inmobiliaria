/**
 * Smoke test end-to-end del pipeline de publicación.
 *
 * Simula el flujo COMPLETO sin tocar ningún portal real:
 *   1. Crea una property de prueba directamente en DB (status='approved',
 *      legal_status='approved', con foto) → el trigger SQL inserta listings.
 *   2. Verifica que se hayan creado 3 listings (uno por portal) status='pending'.
 *   3. Simula un publish manual con un MockAdapter que sin llamar a internet
 *      marca el listing como published.
 *   4. Cambia el precio de la property → trigger marca needs_update=true.
 *   5. Cambia status a 'sold' → trigger marca needs_unpublish=true.
 *   6. Cleanup: elimina property, listings y eventos asociados.
 *
 * Uso:
 *   npm exec tsx scripts/smoke-test-portals-flow.ts
 *
 * Es seguro correrlo en producción: aísla la prueba con un prefijo único en
 * la dirección de la property y limpia todo al final aunque falle algún step.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

function loadDotEnv(path: string) {
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf8')
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}
loadDotEnv(join(process.cwd(), '.env.local'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient<Database>(url, key)

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  const icon = ok ? '✓' : '✗'
  console.log(`${icon} ${label}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

const SMOKE_PREFIX = `[smoke-test ${Date.now()}]`
let propertyId: string | null = null

async function cleanup() {
  if (!propertyId) return
  console.log('\n🧹 Cleanup...')
  await supabase.from('property_publish_events').delete().eq('property_id', propertyId)
  await supabase.from('property_metrics_daily').delete().eq('property_id', propertyId)
  await supabase.from('property_listings').delete().eq('property_id', propertyId)
  await supabase.from('properties').delete().eq('id', propertyId)
  console.log('   Property + listings + events + metrics borrados.')
}

async function main() {
  console.log('Smoke test del pipeline de publicación...\n')

  // 1. Crear property captada (trigger debe insertar listings)
  const { data: created, error: createErr } = await supabase
    .from('properties')
    .insert({
      address: `${SMOKE_PREFIX} Av Test 1234`,
      neighborhood: 'Palermo',
      city: 'CABA',
      property_type: 'departamento',
      asking_price: 180000,
      currency: 'USD',
      status: 'approved',
      legal_status: 'approved',
      photos: ['https://example.com/smoke-photo.jpg'],
      latitude: -34.58,
      longitude: -58.43,
      description: 'Smoke test property — luminoso departamento de tres ambientes con balcón aterrazado, vista despejada y excelente luminosidad natural durante todo el día.',
      amenities: ['pileta', 'parrilla'],
      operation_type: 'venta',
    })
    .select()
    .single()

  if (createErr || !created) {
    check('Crear property captada', false, createErr?.message)
    return
  }
  propertyId = created.id
  check('Crear property captada', true, `id=${created.id}`)

  // 2. Verificar que el trigger creó los 3 listings
  await new Promise(r => setTimeout(r, 200)) // dar tiempo al trigger
  const { data: listings, error: lErr } = await supabase
    .from('property_listings')
    .select('*')
    .eq('property_id', created.id)
    .order('portal')

  if (lErr) {
    check('Trigger enqueue_property_listings disparó', false, lErr.message)
    return
  }
  const portals = (listings ?? []).map(l => l.portal).sort()
  check(
    'Trigger enqueue_property_listings disparó 3 listings',
    JSON.stringify(portals) === JSON.stringify(['argenprop', 'mercadolibre', 'zonaprop']),
    `actual: ${JSON.stringify(portals)}`,
  )
  check(
    'Todos los listings arrancan en status=pending',
    (listings ?? []).every(l => l.status === 'pending'),
  )

  // 3. Simular publish exitoso de un listing (lo hace el worker en prod)
  const mlListing = listings?.find(l => l.portal === 'mercadolibre')
  if (mlListing) {
    await supabase.from('property_listings').update({
      status: 'published',
      external_id: 'MLA_SMOKE_123',
      external_url: 'https://example.com/MLA_SMOKE_123',
      last_published_at: new Date().toISOString(),
      attempts: 1,
    }).eq('id', mlListing.id)
    await supabase.from('property_publish_events').insert({
      listing_id: mlListing.id,
      property_id: created.id,
      portal: 'mercadolibre',
      event_type: 'published',
      payload: { externalId: 'MLA_SMOKE_123' },
    })
    const { data: refreshed } = await supabase
      .from('property_listings')
      .select('status, external_id')
      .eq('id', mlListing.id)
      .single()
    check(
      'Listing ML pasó a status=published',
      refreshed?.status === 'published' && refreshed?.external_id === 'MLA_SMOKE_123',
    )
  }

  // 4. Cambiar precio → trigger marca needs_update=true
  await supabase.from('properties').update({ asking_price: 195000 }).eq('id', created.id)
  await new Promise(r => setTimeout(r, 200))
  const { data: afterPriceChange } = await supabase
    .from('property_listings')
    .select('metadata')
    .eq('id', mlListing!.id)
    .single()
  const needsUpdate = (afterPriceChange?.metadata as { needs_update?: boolean } | null)?.needs_update
  check(
    'Cambio de precio marca needs_update=true en listings published',
    needsUpdate === true,
    `metadata: ${JSON.stringify(afterPriceChange?.metadata)}`,
  )

  // 5. Cambiar status a 'sold' → trigger marca needs_unpublish=true
  await supabase.from('properties').update({ status: 'sold' }).eq('id', created.id)
  await new Promise(r => setTimeout(r, 200))
  const { data: afterSold } = await supabase
    .from('property_listings')
    .select('metadata')
    .eq('id', mlListing!.id)
    .single()
  const needsUnpublish = (afterSold?.metadata as { needs_unpublish?: boolean } | null)?.needs_unpublish
  check(
    'status=sold marca needs_unpublish=true en listings published',
    needsUnpublish === true,
    `metadata: ${JSON.stringify(afterSold?.metadata)}`,
  )

  // 6. Verificar que se loguearon eventos en el audit
  const { data: events } = await supabase
    .from('property_publish_events')
    .select('event_type, portal')
    .eq('property_id', created.id)
  check(
    'Audit log tiene al menos 1 evento registrado',
    (events?.length ?? 0) >= 1,
    `eventos: ${events?.length ?? 0}`,
  )

  console.log(`\n${failures === 0 ? '✅ Todo OK' : `❌ ${failures} chequeo(s) fallaron`}`)
}

main()
  .catch(e => {
    console.error(e)
    failures++
  })
  .finally(async () => {
    await cleanup()
    process.exit(failures === 0 ? 0 : 1)
  })
