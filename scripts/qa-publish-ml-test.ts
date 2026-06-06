/**
 * QA del wizard de publicación en MercadoLibre.
 *
 * Uso: node --env-file=.env.local --import tsx scripts/qa-publish-ml-test.ts <cmd> <propertyId>
 *   verify <propertyId>   -> imprime el item de ML tal como quedó publicado
 *   teardown <propertyId> -> CIERRA el item de ML (status closed) SIN borrar la propiedad
 *
 * SEGURIDAD: solo opera sobre propiedades cuyo título empiece con "[TEST"
 * (regla CLAUDE.md: ninguna propiedad real matchea ese prefijo).
 */
import { createClient } from '@supabase/supabase-js'
import { mlFetch } from '../lib/portals/mercadolibre/client'

async function main() {
  const [cmd, propertyId] = process.argv.slice(2)
  if (!cmd || !propertyId) {
    console.error('uso: <verify|teardown> <propertyId>')
    process.exit(1)
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: prop } = await sb.from('properties').select('title').eq('id', propertyId).maybeSingle()
  if (!prop) {
    console.error('propiedad no encontrada')
    process.exit(1)
  }
  if (!String(prop.title ?? '').startsWith('[TEST')) {
    console.error('ABORT: la propiedad no es de prueba (título no empieza con "[TEST"). No se toca.')
    process.exit(1)
  }
  const { data: listing } = await sb
    .from('property_listings')
    .select('external_id, external_url')
    .eq('property_id', propertyId)
    .eq('portal', 'mercadolibre')
    .maybeSingle()
  if (!listing?.external_id) {
    console.error('sin external_id (la propiedad no está publicada en ML)')
    process.exit(1)
  }

  if (cmd === 'verify') {
    const item = await mlFetch(`/items/${listing.external_id}`)
    console.log(JSON.stringify(item, null, 2))
  } else if (cmd === 'teardown') {
    await mlFetch(`/items/${listing.external_id}`, { method: 'PUT', body: JSON.stringify({ status: 'closed' }) })
    await sb.from('property_listings').update({ status: 'closed' }).eq('property_id', propertyId).eq('portal', 'mercadolibre')
    console.log(`OK: item ${listing.external_id} cerrado. Propiedad ${propertyId} INTACTA.`)
  } else {
    console.error(`comando desconocido: ${cmd}`)
    process.exit(1)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
