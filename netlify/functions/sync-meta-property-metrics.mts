import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { fetchCampaignInsights } from '@/lib/marketing/meta-campaign-builder'

/**
 * Sincroniza métricas Meta de todas las campañas activas/pausadas cada 6h.
 * Upsert en property_meta_metrics_daily.
 */
export default async () => {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: campaigns } = await supabase
    .from('property_meta_campaigns')
    .select('property_id, campaign_id, status')
    .in('status', ['active', 'paused'])

  if (!campaigns || campaigns.length === 0) {
    return new Response('no campaigns', { status: 200 })
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // últimos 7 días

  let processed = 0
  let errors = 0
  for (const c of campaigns) {
    try {
      const insights = await fetchCampaignInsights(c.campaign_id, since)
      for (const i of insights) {
        await supabase.from('property_meta_metrics_daily').upsert({
          property_id: c.property_id,
          campaign_id: c.campaign_id,
          date: i.date,
          impressions: i.impressions,
          clicks: i.clicks,
          ctr: i.ctr,
          spend: i.spend,
          leads: i.leads,
          cost_per_lead: i.cost_per_lead,
          reach: i.reach,
          raw: i.raw as never,
        })
      }
      processed++
    } catch (err) {
      errors++
      console.error(`[sync-meta-metrics] ${c.campaign_id}`, err)
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
