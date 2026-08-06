#!/usr/bin/env tsx
/**
 * Auditoría Meta Ads + funnel CRM para los últimos 15 días vs los 15 anteriores.
 *
 * Ventana actual:   2026-05-08 → 2026-05-22 (15 días)
 * Ventana previa:   2026-04-23 → 2026-05-07 (15 días)
 *
 * Salida: imprime JSON estructurado a stdout para que el modelo lo analice.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
loadEnvLocal()

const META_API = 'https://graph.facebook.com/v21.0'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const accountId = (process.env.META_AD_ACCOUNT_ID || '').startsWith('act_')
  ? process.env.META_AD_ACCOUNT_ID!
  : `act_${process.env.META_AD_ACCOUNT_ID}`
const accessToken = process.env.META_ACCESS_TOKEN!

const WINDOW_CURR = { since: '2026-05-08', until: '2026-05-22', label: 'curr' }
const WINDOW_PREV = { since: '2026-04-23', until: '2026-05-07', label: 'prev' }

const LEAD_TYPES = [
  'lead',
  'complete_registration',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_complete_registration',
]

type Insight = {
  campaign_id: string
  campaign_name: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  impressions: string
  clicks: string
  ctr: string
  spend: string
  reach?: string
  frequency?: string
  date_start: string
  date_stop: string
  actions?: Array<{ action_type: string; value: string }>
  cost_per_action_type?: Array<{ action_type: string; value: string }>
}

async function fetchInsights(
  level: 'campaign' | 'ad',
  since: string,
  until: string
): Promise<Insight[]> {
  const fields = level === 'campaign'
    ? 'campaign_id,campaign_name,impressions,clicks,ctr,spend,reach,frequency,actions,cost_per_action_type'
    : 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,ctr,spend,reach,frequency,actions,cost_per_action_type'
  const timeRange = JSON.stringify({ since, until })
  const url = `${META_API}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=${level}&limit=500&access_token=${accessToken}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Meta API ${level}: ${JSON.stringify(err)}`)
  }
  const json = await res.json()
  return json.data || []
}

function getAction(actions: Insight['actions'] | undefined, types: string[]): number {
  if (!actions) return 0
  for (const t of types) {
    const m = actions.find(a => a.action_type === t)
    if (m && parseInt(m.value, 10) > 0) return parseInt(m.value, 10)
  }
  return 0
}

function getLandingPageViews(insight: Insight): number {
  return getAction(insight.actions, ['landing_page_view'])
}

function getLeads(insight: Insight): number {
  return getAction(insight.actions, LEAD_TYPES)
}

function summarizeInsight(i: Insight) {
  const spend = parseFloat(i.spend || '0')
  const impressions = parseInt(i.impressions || '0', 10)
  const clicks = parseInt(i.clicks || '0', 10)
  const lpv = getLandingPageViews(i)
  const leads = getLeads(i)
  return {
    impressions,
    clicks,
    landing_page_views: lpv,
    leads,
    spend: +spend.toFixed(2),
    reach: i.reach ? parseInt(i.reach, 10) : null,
    frequency: i.frequency ? +parseFloat(i.frequency).toFixed(2) : null,
    ctr_pct: impressions > 0 ? +((clicks / impressions) * 100).toFixed(2) : 0,
    lpv_rate_pct: clicks > 0 ? +((lpv / clicks) * 100).toFixed(2) : 0,
    cpl: leads > 0 ? +(spend / leads).toFixed(2) : null,
    cost_per_lpv: lpv > 0 ? +(spend / lpv).toFixed(2) : null,
  }
}

function classifyCampaign(name: string): 'tasacion_directa' | 'clase_gratuita' | 'hnwi' | 'otra' {
  const n = name.toLowerCase()
  if (n.includes('hnwi') || n.includes('alto valor') || n.includes('premium')) return 'hnwi'
  if (n.includes('clase') || n.includes('curso')) return 'clase_gratuita'
  if (n.includes('tasaci')) return 'tasacion_directa'
  return 'otra'
}

async function getCampaignStatuses() {
  const url = `${META_API}/${accountId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time&limit=200&access_token=${accessToken}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Meta API campaigns: ${JSON.stringify(err)}`)
  }
  const json = await res.json()
  return json.data || []
}

async function getFunnelMetrics(from: string, to: string) {
  const { data, error } = await supabase.rpc('get_funnel_metrics', { p_from: from, p_to: to })
  if (error) throw error
  return data
}

async function getDealsByOriginInWindow(from: string, to: string) {
  // Deals created in window
  const { data: created, error: e1 } = await supabase
    .from('deals')
    .select('id,origin,stage,created_at,scheduled_at,visited_at,delivered_at,captured_at,lost_at')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
  if (e1) throw e1
  return created || []
}

async function getStageTransitionsInWindow(from: string, to: string) {
  // Stage transitions logged in deal_stage_history
  const { data, error } = await supabase
    .from('deal_stage_history')
    .select('deal_id,from_stage,to_stage,changed_at,deals!inner(origin)')
    .gte('changed_at', `${from}T00:00:00`)
    .lte('changed_at', `${to}T23:59:59`)
  if (error) {
    // table may not exist with that exact name — try alternative
    return { error: error.message }
  }
  return data
}

async function getAppraisalEventsInWindow(from: string, to: string) {
  // Count of deal-stage events that occurred IN the window (regardless of when deal was created),
  // filtered by origin embudo / clase_gratuita / hnwi
  const fromTs = `${from}T00:00:00`
  const toTs = `${to}T23:59:59`

  const [scheduled, visited, delivered, captured, lost] = await Promise.all([
    supabase.from('deals')
      .select('id,origin,scheduled_at', { count: 'exact', head: false })
      .gte('scheduled_at', fromTs)
      .lte('scheduled_at', toTs)
      .in('origin', ['embudo', 'clase_gratuita']),
    supabase.from('deals')
      .select('id,origin,visited_at', { count: 'exact', head: false })
      .gte('visited_at', fromTs)
      .lte('visited_at', toTs)
      .in('origin', ['embudo', 'clase_gratuita']),
    supabase.from('deals')
      .select('id,origin,delivered_at', { count: 'exact', head: false })
      .gte('delivered_at', fromTs)
      .lte('delivered_at', toTs)
      .in('origin', ['embudo', 'clase_gratuita']),
    supabase.from('deals')
      .select('id,origin,captured_at', { count: 'exact', head: false })
      .gte('captured_at', fromTs)
      .lte('captured_at', toTs)
      .in('origin', ['embudo', 'clase_gratuita']),
    supabase.from('deals')
      .select('id,origin,lost_at', { count: 'exact', head: false })
      .gte('lost_at', fromTs)
      .lte('lost_at', toTs)
      .in('origin', ['embudo', 'clase_gratuita']),
  ])

  function byOrigin(rows: any[] | null): Record<string, number> {
    const out: Record<string, number> = { embudo: 0, clase_gratuita: 0 }
    for (const r of rows || []) {
      out[r.origin] = (out[r.origin] || 0) + 1
    }
    return out
  }

  return {
    scheduled: byOrigin(scheduled.data),
    visited: byOrigin(visited.data),
    delivered: byOrigin(delivered.data),
    captured: byOrigin(captured.data),
    lost: byOrigin(lost.data),
  }
}

async function getDealsCreatedByOriginInWindow(from: string, to: string) {
  const { data, error } = await supabase
    .from('deals')
    .select('id,origin,stage,created_at')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .in('origin', ['embudo', 'clase_gratuita'])
  if (error) throw error
  const out: Record<string, { total: number; by_stage: Record<string, number> }> = {
    embudo: { total: 0, by_stage: {} },
    clase_gratuita: { total: 0, by_stage: {} },
  }
  for (const d of data || []) {
    const o = d.origin as string
    if (!out[o]) continue
    out[o].total++
    out[o].by_stage[d.stage] = (out[o].by_stage[d.stage] || 0) + 1
  }
  return out
}

async function getDailyMetaSeries(from: string, to: string) {
  // Daily series by campaign for trend analysis
  const { data, error } = await supabase
    .from('meta_ads_daily')
    .select('date,campaign_id,campaign_name,impressions,clicks,landing_page_views,spend,leads')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })
  if (error) throw error
  return data || []
}

async function main() {
  const out: any = {
    generated_at: new Date().toISOString(),
    window_curr: WINDOW_CURR,
    window_prev: WINDOW_PREV,
  }

  console.error('→ Fetching Meta campaign statuses…')
  out.campaign_statuses = await getCampaignStatuses()

  console.error('→ Fetching Meta campaign insights (current window)…')
  const campCurr = await fetchInsights('campaign', WINDOW_CURR.since, WINDOW_CURR.until)
  console.error('→ Fetching Meta campaign insights (previous window)…')
  const campPrev = await fetchInsights('campaign', WINDOW_PREV.since, WINDOW_PREV.until)

  function rollupByCampaign(insights: Insight[]) {
    const map = new Map<string, any>()
    for (const i of insights) {
      const k = i.campaign_id
      if (!map.has(k)) {
        map.set(k, {
          campaign_id: k,
          campaign_name: i.campaign_name,
          classification: classifyCampaign(i.campaign_name),
          impressions: 0,
          clicks: 0,
          landing_page_views: 0,
          leads: 0,
          spend: 0,
        })
      }
      const row = map.get(k)
      row.impressions += parseInt(i.impressions || '0', 10)
      row.clicks += parseInt(i.clicks || '0', 10)
      row.landing_page_views += getLandingPageViews(i)
      row.leads += getLeads(i)
      row.spend += parseFloat(i.spend || '0')
    }
    return Array.from(map.values()).map(r => ({
      ...r,
      spend: +r.spend.toFixed(2),
      ctr_pct: r.impressions > 0 ? +((r.clicks / r.impressions) * 100).toFixed(2) : 0,
      lpv_rate_pct: r.clicks > 0 ? +((r.landing_page_views / r.clicks) * 100).toFixed(2) : 0,
      cpl: r.leads > 0 ? +(r.spend / r.leads).toFixed(2) : null,
      cost_per_lpv: r.landing_page_views > 0 ? +(r.spend / r.landing_page_views).toFixed(2) : null,
    }))
  }

  out.campaigns_curr = rollupByCampaign(campCurr)
  out.campaigns_prev = rollupByCampaign(campPrev)

  console.error('→ Fetching Meta ad-level insights (current window)…')
  const adsCurr = await fetchInsights('ad', WINDOW_CURR.since, WINDOW_CURR.until)
  out.ads_curr = adsCurr.map(a => ({
    campaign_name: a.campaign_name,
    classification: classifyCampaign(a.campaign_name),
    adset_name: a.adset_name,
    ad_name: a.ad_name,
    ...summarizeInsight(a),
  })).sort((x, y) => y.spend - x.spend)

  console.error('→ Fetching Meta ad-level insights (previous window)…')
  const adsPrev = await fetchInsights('ad', WINDOW_PREV.since, WINDOW_PREV.until)
  out.ads_prev_summary = adsPrev.map(a => ({
    campaign_name: a.campaign_name,
    classification: classifyCampaign(a.campaign_name),
    ad_name: a.ad_name,
    ...summarizeInsight(a),
  })).sort((x, y) => y.spend - x.spend)

  console.error('→ Fetching funnel CRM metrics (current)…')
  out.funnel_curr_rpc = await getFunnelMetrics(WINDOW_CURR.since, WINDOW_CURR.until)
  console.error('→ Fetching funnel CRM metrics (previous)…')
  out.funnel_prev_rpc = await getFunnelMetrics(WINDOW_PREV.since, WINDOW_PREV.until)

  console.error('→ Fetching deal stage transition events (current)…')
  out.events_curr = await getAppraisalEventsInWindow(WINDOW_CURR.since, WINDOW_CURR.until)
  console.error('→ Fetching deal stage transition events (previous)…')
  out.events_prev = await getAppraisalEventsInWindow(WINDOW_PREV.since, WINDOW_PREV.until)

  console.error('→ Fetching deals created by origin (current)…')
  out.deals_created_curr = await getDealsCreatedByOriginInWindow(WINDOW_CURR.since, WINDOW_CURR.until)
  console.error('→ Fetching deals created by origin (previous)…')
  out.deals_created_prev = await getDealsCreatedByOriginInWindow(WINDOW_PREV.since, WINDOW_PREV.until)

  console.error('→ Fetching daily Meta series (current)…')
  out.daily_curr = await getDailyMetaSeries(WINDOW_CURR.since, WINDOW_CURR.until)

  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
