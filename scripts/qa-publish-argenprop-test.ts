/**
 * QA del wizard de publicación en Argenprop (API REST integradores.api.sosiva451.com v1).
 *
 * Uso: node --env-file=.env.local --import tsx scripts/qa-publish-argenprop-test.ts <cmd> [arg]
 *   recon [propertyId]      -> read-only: propiedad + listing + login + barrio resuelto
 *   publish <propertyId>    -> publica el aviso (POST /v1/avisos)
 *   verify <propertyId>     -> GET /v1/avisos/{codigo} (muestra el aviso publicado)
 *   baja <propertyId>       -> suspende el aviso (estado/suspendido, reversible)
 *   eliminar <propertyId>   -> ELIMINA el aviso (estado/eliminado, IRREVERSIBLE) — teardown de test
 *   force-eliminar <codigo> -> elimina por Codigo directo (sin guard [TEST)
 *
 * SEGURIDAD: publish/verify/baja/eliminar SOLO operan sobre propiedades cuyo título
 * empiece con "[TEST". `force-eliminar` opera por Codigo explícito.
 */
import { createClient } from '@supabase/supabase-js'
import { resolveCredentials } from '../lib/portals/credentials'
import { ArgenpropAdapter } from '../lib/portals/argenprop/adapter'
import { apCodigo, apCategoria } from '../lib/portals/argenprop/field-schema'
import { resolveCabaBarrioId } from '../lib/portals/argenprop/catalog'
import { login, apFetch } from '../lib/portals/argenprop/client'

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
  if (!id) { console.log('No hay propiedad de prueba ([TEST...).'); return }
  const { data: p } = await sb().from('properties').select('*').eq('id', id).maybeSingle()
  if (!p) { console.log('propiedad no encontrada'); return }
  console.log('=== PROPIEDAD ===')
  console.log({ id: p.id, title: p.title, status: p.status, legal_status: p.legal_status,
    lat: p.latitude, lng: p.longitude, photos: (p.photos ?? []).length, desc_chars: (p.description ?? '').length,
    codigo: apCodigo(p as never), categoria: apCategoria(p as never) })
  const { data: listing } = await sb().from('property_listings').select('*')
    .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
  console.log('=== LISTING ===', listing ?? '(sin listing)')
  const c = await creds().catch(e => { console.log('creds:', e.message); return null })
  if (c) {
    const token = await login(c).catch(e => { console.log('LOGIN FALLÓ:', e.message); return null })
    console.log('=== AUTH ===', token ? `login OK (token len ${token.length})` : 'login FALLÓ')
    if (token) {
      const barrio = await resolveCabaBarrioId(c, p.neighborhood).catch(() => null)
      console.log('=== BARRIO ===', `"${p.neighborhood}" → ${barrio ?? '(no resuelto)'}`)
    }
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
  const result = await new ArgenpropAdapter(true, c).publish(property as never, {
    attributeOverrides: (meta.ap_attributes ?? {}) as Record<string, { value_name?: string; value_id?: string }>,
  })
  await sb().from('property_listings').upsert({
    property_id: propertyId, portal: 'argenprop', status: 'published',
    external_id: result.externalId, external_url: result.externalUrl,
    last_published_at: new Date().toISOString(), last_error: null,
    metadata: { ...meta, aviso_id: result.metadata?.avisoId ?? null, codigo: result.externalId } as never,
  }, { onConflict: 'property_id,portal' })
  console.log('OK publicado:', result)
}

async function verify(propertyId: string) {
  await assertTest(propertyId)
  const c = await creds()
  const { data: listing } = await sb().from('property_listings').select('*')
    .eq('property_id', propertyId).eq('portal', 'argenprop').maybeSingle()
  if (!listing?.external_id) throw new Error('sin external_id (no publicado)')
  console.log('=== LISTING DB ===', { status: listing.status, external_id: listing.external_id, metadata: listing.metadata })
  const aviso = await apFetch(c, `/v1/avisos/${encodeURIComponent(listing.external_id)}`).catch(e => ({ error: e.message }))
  console.log('=== GET /v1/avisos/{codigo} ===')
  console.log(JSON.stringify(aviso, null, 1).slice(0, 1500))
}

async function setEstado(propertyId: string, estado: 'suspendido' | 'eliminado') {
  await assertTest(propertyId)
  const c = await creds()
  const { data: listing } = await sb().from('property_listings').select('external_id')
    .eq('property_id', propertyId).eq('portal', 'argenprop').maybeSingle()
  if (!listing?.external_id) throw new Error('sin external_id (no publicado)')
  await new ArgenpropAdapter(true, c).setEstado(listing.external_id, estado)
  await sb().from('property_listings').update({ status: estado === 'eliminado' ? 'closed' : 'paused' })
    .eq('property_id', propertyId).eq('portal', 'argenprop')
  console.log(`OK: aviso ${listing.external_id} → estado ${estado}. Propiedad ${propertyId} INTACTA.`)
}

async function forceEliminar(codigo: string) {
  const c = await creds()
  await new ArgenpropAdapter(true, c).setEstado(codigo, 'eliminado')
  await sb().from('property_listings').update({ status: 'closed' }).eq('external_id', codigo).eq('portal', 'argenprop')
  console.log(`OK: aviso ${codigo} eliminado (Argenprop + DB).`)
}

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  if (cmd === 'recon') return recon(arg)
  if (cmd === 'force-eliminar') { if (!arg) { console.error('uso: force-eliminar <codigo>'); process.exit(1) } return forceEliminar(arg) }
  if (!arg) { console.error('uso: <recon|publish|verify|baja|eliminar> [propertyId]'); process.exit(1) }
  if (cmd === 'publish') return publish(arg)
  if (cmd === 'verify') return verify(arg)
  if (cmd === 'baja') return setEstado(arg, 'suspendido')
  if (cmd === 'eliminar') return setEstado(arg, 'eliminado')
  console.error(`comando desconocido: ${cmd}`); process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
