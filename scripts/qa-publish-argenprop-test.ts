/**
 * QA del wizard de publicación en Argenprop (PublicarIntranet).
 *
 * Uso: node --env-file=.env.local --import tsx scripts/qa-publish-argenprop-test.ts <cmd> [arg]
 *   recon [propertyId]    -> read-only: estado de la propiedad de prueba + listing + creds
 *   probe                 -> request mínimo real al endpoint para DESCUBRIR el contrato
 *                            (publica un aviso mínimo y lo da de baja inmediatamente)
 *   publish <propertyId>  -> publica la propiedad de prueba en Argenprop
 *   verify <propertyId>   -> imprime el listing + visibilidadIds + intenta abrir la URL
 *   baja <propertyId>     -> da de baja (Estado=Baja) SIN borrar la propiedad
 *   force-baja <idOrigen> -> baja por IdOrigen directo (sin guard [TEST)
 *
 * SEGURIDAD: publish/verify/baja SOLO operan sobre propiedades cuyo título empiece
 * con "[TEST". `probe` y `force-baja` no tienen guard (operan sobre datos sintéticos
 * o un idOrigen explícito).
 */
import { createClient } from '@supabase/supabase-js'
import { resolveCredentials } from '../lib/portals/credentials'
import { ArgenpropAdapter } from '../lib/portals/argenprop/adapter'
import { apAvisoId } from '../lib/portals/argenprop/field-schema'
import { propertyToApForm } from '../lib/portals/argenprop/mapping'
import { apPublish, encodeForm } from '../lib/portals/argenprop/client'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function creds() {
  const c = await resolveCredentials('argenprop', { env: process.env, supabase: sb() as never })
  if (!c.ap) throw new Error('Faltan credenciales ARGENPROP_* en .env.local')
  return c.ap
}

async function findTestPropertyId(): Promise<string | null> {
  const { data } = await sb().from('properties').select('id, title, created_at')
    .ilike('title', '[TEST%').order('created_at', { ascending: false }).limit(1)
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
  if (!id) { console.log('No se encontró propiedad de prueba ([TEST...).'); return }
  const { data: p } = await sb().from('properties').select('*').eq('id', id).maybeSingle()
  if (!p) { console.log('propiedad no encontrada'); return }
  console.log('=== PROPIEDAD DE PRUEBA ===')
  console.log({ id: p.id, title: p.title, status: p.status, legal_status: p.legal_status,
    lat: p.latitude, lng: p.longitude, photos: (p.photos ?? []).length,
    desc_chars: (p.description ?? '').length, idOrigen: apAvisoId(p as never) })
  const { data: listing } = await sb().from('property_listings').select('*')
    .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
  console.log('=== LISTING ARGENPROP ===')
  console.log(listing ?? '(sin listing)')
  const c = await creds().catch(e => { console.log('creds:', e.message); return null })
  console.log('=== CREDS ===', c ? { usr: c.usr, idSistema: c.idSistema, idVendedor: c.idVendedor, publishUrl: c.publishUrl, enabled: true } : '(faltan)')
}

/**
 * Descubre el contrato real: arma el form de la propiedad de prueba, lo IMPRIME
 * (sin publicar), después hace UN publish real y lo da de baja inmediatamente.
 * Imprime la respuesta cruda para confirmar nombres de campos / shape de error.
 */
async function probe() {
  const c = await creds()
  const id = await findTestPropertyId()
  if (!id) throw new Error('necesito una propiedad [TEST para el probe')
  const { data: p } = await sb().from('properties').select('*').eq('id', id).single()
  const form = propertyToApForm(p as never, { creds: c, idOrigen: apAvisoId(p as never), estado: 'Activo' })
  console.log('=== FORM (claves) ===')
  console.log(Object.keys(form).join('\n'))
  console.log('=== BODY urlencoded (primeros 800 chars) ===')
  console.log(encodeForm(form).slice(0, 800))
  console.log('\n=== PUBLICANDO (real) ===')
  try {
    const res = await apPublish(form, c)
    console.log('OK respuesta:', JSON.stringify(res, null, 2))
    console.log('\n=== DANDO DE BAJA inmediatamente ===')
    await new ArgenpropAdapter(true, c).unpublish(apAvisoId(p as never))
    console.log('baja OK')
  } catch (e) {
    console.log('ERROR (esto enseña el contrato):', e instanceof Error ? e.message : e)
  }
}

async function publish(propertyId: string) {
  await assertTest(propertyId)
  const c = await creds()
  const { data: property } = await sb().from('properties').select('*').eq('id', propertyId).single()
  if (!property) throw new Error('propiedad no encontrada')
  const { data: listing } = await sb().from('property_listings').select('metadata')
    .eq('property_id', propertyId).eq('portal', 'argenprop').maybeSingle()
  const meta = (listing?.metadata ?? {}) as Record<string, unknown>
  const adapter = new ArgenpropAdapter(true, c)
  const result = await adapter.publish(property as never, {
    attributeOverrides: (meta.ap_attributes ?? {}) as Record<string, { value_name?: string; value_id?: string }>,
  })
  await sb().from('property_listings').upsert({
    property_id: propertyId, portal: 'argenprop', status: 'published',
    external_id: result.externalId, external_url: result.externalUrl,
    last_published_at: new Date().toISOString(), last_error: null,
    metadata: { ...meta, visibilidad_ids: result.metadata?.visibilidadIds ?? [] } as never,
  }, { onConflict: 'property_id,portal' })
  console.log('OK publicado:', result)
}

async function verify(propertyId: string) {
  await assertTest(propertyId)
  const { data: listing } = await sb().from('property_listings').select('*')
    .eq('property_id', propertyId).eq('portal', 'argenprop').maybeSingle()
  if (!listing?.external_id) throw new Error('sin external_id (no publicado)')
  console.log('=== LISTING ===', { status: listing.status, external_id: listing.external_id,
    external_url: listing.external_url, metadata: listing.metadata })
  if (listing.external_url) {
    try {
      const r = await fetch(listing.external_url, { method: 'GET' })
      console.log(`URL ${listing.external_url} → HTTP ${r.status}`)
    } catch (e) { console.log('URL no alcanzable:', e instanceof Error ? e.message : e) }
  }
}

async function baja(propertyId: string) {
  await assertTest(propertyId)
  const c = await creds()
  const { data: listing } = await sb().from('property_listings').select('external_id')
    .eq('property_id', propertyId).eq('portal', 'argenprop').maybeSingle()
  if (!listing?.external_id) throw new Error('sin external_id (no publicado)')
  await new ArgenpropAdapter(true, c).unpublish(listing.external_id)
  await sb().from('property_listings').update({ status: 'paused' })
    .eq('property_id', propertyId).eq('portal', 'argenprop')
  console.log(`OK: aviso ${listing.external_id} dado de baja. Propiedad ${propertyId} INTACTA.`)
}

async function forceBaja(idOrigen: string) {
  const c = await creds()
  await new ArgenpropAdapter(true, c).unpublish(idOrigen)
  await sb().from('property_listings').update({ status: 'paused' })
    .eq('external_id', idOrigen).eq('portal', 'argenprop')
  console.log(`OK: aviso ${idOrigen} dado de baja (Argenprop + DB).`)
}

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  if (cmd === 'recon') return recon(arg)
  if (cmd === 'probe') return probe()
  if (cmd === 'force-baja') { if (!arg) { console.error('uso: force-baja <idOrigen>'); process.exit(1) } return forceBaja(arg) }
  if (!arg) { console.error('uso: <recon|probe|publish|verify|baja> [propertyId]'); process.exit(1) }
  if (cmd === 'publish') return publish(arg)
  if (cmd === 'verify') return verify(arg)
  if (cmd === 'baja') return baja(arg)
  console.error(`comando desconocido: ${cmd}`); process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
