/**
 * QA del wizard de publicación en MercadoLibre.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/qa-publish-ml-test.ts <cmd> [propertyId]
 *   recon [propertyId]    -> read-only: estado de la propiedad de prueba + listing + credenciales ML
 *   publish <propertyId>  -> publica en ML con el NUEVO flujo (attrs dinámicos + gold_premium)
 *   verify <propertyId>   -> imprime el item de ML tal como quedó publicado
 *   teardown <propertyId> -> CIERRA el item de ML (status closed) SIN borrar la propiedad
 *
 * SEGURIDAD: publish/verify/teardown SOLO operan sobre propiedades cuyo título
 * empiece con "[TEST" (regla CLAUDE.md: ninguna propiedad real matchea ese prefijo).
 */
import { createClient } from '@supabase/supabase-js'
import { MercadoLibreAdapter } from '../lib/portals/mercadolibre/adapter'
import { resolveCategory } from '../lib/portals/mercadolibre/mapping'
import { fetchCategoryAttributes } from '../lib/portals/mercadolibre/category-attributes'
import { mlFetch } from '../lib/portals/mercadolibre/client'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function findTestPropertyId(): Promise<string | null> {
  const { data } = await sb()
    .from('properties')
    .select('id, title, created_at')
    .ilike('title', '[TEST%')
    .order('created_at', { ascending: false })
    .limit(1)
  return data?.[0]?.id ?? null
}

async function assertTest(propertyId: string) {
  const { data: prop } = await sb().from('properties').select('title').eq('id', propertyId).maybeSingle()
  if (!prop) throw new Error('propiedad no encontrada')
  if (!String(prop.title ?? '').startsWith('[TEST')) {
    throw new Error('ABORT: la propiedad no es de prueba (título no empieza con "[TEST"). No se toca.')
  }
}

async function recon(propertyId?: string) {
  const id = propertyId ?? (await findTestPropertyId())
  if (!id) {
    console.log('No se encontró ninguna propiedad de prueba (título "[TEST...").')
    return
  }
  const { data: p } = await sb().from('properties').select('*').eq('id', id).maybeSingle()
  if (!p) { console.log('propiedad no encontrada'); return }
  console.log('=== PROPIEDAD DE PRUEBA ===')
  console.log({
    id: p.id, title: p.title, status: p.status, legal_status: p.legal_status,
    lat: p.latitude, lng: p.longitude, photos: (p.photos ?? []).length,
    descripcion_chars: (p.description ?? '').length, video_url: p.video_url, tour_3d_url: p.tour_3d_url,
    category: resolveCategory(p as never),
  })
  const { data: listing } = await sb().from('property_listings').select('*').eq('property_id', id).eq('portal', 'mercadolibre').maybeSingle()
  console.log('=== LISTING ML ===')
  console.log(listing ? { status: listing.status, external_id: listing.external_id, external_url: listing.external_url, metadata: listing.metadata } : '(sin listing)')
  const { data: cred } = await sb().from('portal_credentials').select('enabled, expires_at, access_token').eq('portal', 'mercadolibre').maybeSingle()
  console.log('=== CREDENCIALES ML ===')
  console.log(cred ? { enabled: cred.enabled, expires_at: cred.expires_at, has_access_token: !!cred.access_token } : '(sin credenciales)')
  try {
    const { required, recommended } = await fetchCategoryAttributes(resolveCategory(p as never))
    console.log(`=== ATRIBUTOS CATEGORÍA (${resolveCategory(p as never)}) ===`)
    console.log('required:', required.map(a => `${a.id}(${a.valueType})`).join(', '))
    console.log('recommended:', recommended.slice(0, 12).map(a => a.id).join(', '), recommended.length > 12 ? `… +${recommended.length - 12}` : '')
  } catch (e) {
    console.log('No se pudieron traer atributos de ML:', e instanceof Error ? e.message : e)
  }
}

async function publish(propertyId: string) {
  await assertTest(propertyId)
  const { data: property } = await sb().from('properties').select('*').eq('id', propertyId).single()
  if (!property) throw new Error('propiedad no encontrada')

  const categoryId = resolveCategory(property as never)
  const { required, recommended } = await fetchCategoryAttributes(categoryId)
  const allowedAttributeIds = new Set([...required, ...recommended].map(a => a.id))

  // ¿Qué atributos derivados agrega el mapping solo? (misma truthiness que derivedAttributes)
  const derivedPresent: Record<string, boolean> = {
    ROOMS: !!property.rooms, BEDROOMS: !!property.bedrooms, FULL_BATHROOMS: !!property.bathrooms,
    PARKING_LOTS: !!property.garages, COVERED_AREA: !!property.covered_area, TOTAL_AREA: !!property.total_area,
    MAINTENANCE_FEE: !!property.expensas, PROPERTY_AGE: property.age != null, FLOORS: property.floor != null,
  }
  // Auto-completar los REQUERIDOS que el mapping NO provee (para QA: valores plausibles).
  const attributeOverrides: Record<string, { value_name?: string; value_id?: string }> = {}
  for (const a of required) {
    if (derivedPresent[a.id]) continue // el mapping ya lo agrega desde la propiedad
    if (a.valueType === 'list' && a.allowedValues?.length) attributeOverrides[a.id] = { value_id: a.allowedValues[0].id }
    else if (a.valueType === 'boolean') attributeOverrides[a.id] = { value_name: 'No' }
    else if (a.id === 'PARKING_LOTS') attributeOverrides[a.id] = { value_name: '0' }
    else if (a.valueType === 'number_unit') attributeOverrides[a.id] = { value_name: '1 m²' }
    else attributeOverrides[a.id] = { value_name: '1' }
  }

  const ytId = /youtu\.?be/.test(property.video_url ?? '') ? 'video' : 'none'
  const adapter = new MercadoLibreAdapter(true)
  console.log('Publicando con:', { categoryId, listingType: 'gold_premium', mediaChoice: ytId, overrides: Object.keys(attributeOverrides) })
  const result = await adapter.publish(property as never, {
    attributeOverrides,
    mediaChoice: ytId as 'video' | 'none',
    listingType: 'gold_premium',
    allowedAttributeIds,
  })
  await sb().from('property_listings').upsert(
    {
      property_id: propertyId, portal: 'mercadolibre', status: 'published',
      external_id: result.externalId, external_url: result.externalUrl,
      last_published_at: new Date().toISOString(), last_error: null,
      metadata: { listing_type: (result.metadata?.listingTypeUsed as string) ?? 'gold_premium' } as never,
    },
    { onConflict: 'property_id,portal' },
  )
  console.log('OK publicado:', result)
  if (result.metadata?.downgradedFrom) {
    console.log(`⚠ Tier degradado: se pidió ${result.metadata.downgradedFrom} pero ML solo tenía cupo para ${result.metadata.listingTypeUsed}`)
  }
}

async function verify(propertyId: string) {
  await assertTest(propertyId)
  const { data: listing } = await sb().from('property_listings').select('external_id').eq('property_id', propertyId).eq('portal', 'mercadolibre').maybeSingle()
  if (!listing?.external_id) throw new Error('sin external_id (no publicado)')
  const item = await mlFetch(`/items/${listing.external_id}`)
  console.log(JSON.stringify(item, null, 2))
}

async function teardown(propertyId: string) {
  await assertTest(propertyId)
  const { data: listing } = await sb().from('property_listings').select('external_id').eq('property_id', propertyId).eq('portal', 'mercadolibre').maybeSingle()
  if (!listing?.external_id) throw new Error('sin external_id (no publicado)')
  await mlFetch(`/items/${listing.external_id}`, { method: 'PUT', body: JSON.stringify({ status: 'closed' }) })
  await sb().from('property_listings').update({ status: 'closed' }).eq('property_id', propertyId).eq('portal', 'mercadolibre')
  console.log(`OK: item ${listing.external_id} cerrado. Propiedad ${propertyId} INTACTA.`)
}

async function main() {
  const [cmd, propertyId] = process.argv.slice(2)
  if (cmd === 'recon') return recon(propertyId)
  if (!propertyId) { console.error('uso: <recon|publish|verify|teardown> <propertyId>'); process.exit(1) }
  if (cmd === 'publish') return publish(propertyId)
  if (cmd === 'verify') return verify(propertyId)
  if (cmd === 'teardown') return teardown(propertyId)
  console.error(`comando desconocido: ${cmd}`)
  process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
