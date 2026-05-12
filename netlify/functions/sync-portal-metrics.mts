import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { initPortals, getAdapter } from '@/lib/portals'
import type { PortalName } from '@/lib/portals/types'

/**
 * Sincroniza métricas de cada portal cada 6h.
 *
 * Para cada listing published con adapter.enabled, llama fetchMetrics
 * con un ventana de 7 días y upsert en property_metrics_daily.
 */
export default async () => {
  await initPortals()
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: listings } = await supabase
    .from('property_listings')
    .select('*')
    .eq('status', 'published')
    .not('external_id', 'is', null)

  if (!listings || listings.length === 0) {
    return new Response('no listings', { status: 200 })
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  let processed = 0
  let errors = 0
  for (const listing of listings) {
    const adapter = getAdapter(listing.portal as PortalName)
    if (!adapter || !adapter.enabled || !listing.external_id) continue

    try {
      const points = await adapter.fetchMetrics(listing.external_id, since)
      for (const p of points) {
        await supabase.from('property_metrics_daily').upsert({
          property_id: listing.property_id,
          portal: listing.portal,
          date: p.date,
          views: p.views,
          contacts: p.contacts,
          favorites: p.favorites,
          whatsapps: p.whatsapps,
          raw: p.raw as never,
        })
      }
      processed++
    } catch (err) {
      errors++
      console.error(`[sync-metrics] ${listing.portal} ${listing.id}`, err)
    }
  }

  return new Response(JSON.stringify({ processed, errors }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export const config: Config = {
  schedule: '0 */6 * * *',
}
