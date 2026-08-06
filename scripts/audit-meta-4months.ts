#!/usr/bin/env tsx
/**
 * Auditoría Meta Ads — últimos 4 meses (28 Ene 2026 → 27 May 2026)
 * con corte mensual, semanal, por campaña, y por ad.
 *
 * Salida: JSON estructurado a stdout.
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
const accountId = (process.env.META_AD_ACCOUNT_ID || '').startsWith('act_')
  ? process.env.META_AD_ACCOUNT_ID!
  : `act_${process.env.META_AD_ACCOUNT_ID}`
const accessToken = process.env.META_ACCESS_TOKEN!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SINCE = '2026-01-28'
const UNTIL = '2026-05-27'

const LEAD_TYPES = [
  'lead', 'complete_registration',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_complete_registration',
]

function actionValue(actions: any[] | undefined, types: string[]): number {
  if (!actions) return 0
  for (const t of types) {
    const m = actions.find((a: any) => a.action_type === t)
    if (m && parseInt(m.value, 10) > 0) return parseInt(m.value, 10)
  }
  return 0
}

function classify(name: string): 'tasacion' | 'clase' | 'hnwi' | 'otra' {
  const n = (name || '').toLowerCase()
  if (n.includes('hnwi') || n.includes('alto valor') || n.includes('premium')) return 'hnwi'
  if (n.includes('clase') || n.includes('curso')) return 'clase'
  if (n.includes('tasaci')) return 'tasacion'
  return 'otra'
}

async function fetchPaged(initialUrl: string): Promise<any[]> {
  let url: string | null = initialUrl
  const out: any[] = []
  while (url) {
    const res = await fetch(url)
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Meta API ${res.status}: ${t.slice(0, 500)}`)
    }
    const json: any = await res.json()
    out.push(...(json.data || []))
    url = json.paging?.next || null
  }
  return out
}

function summarize(insight: any) {
  const impressions = parseInt(insight.impressions || '0', 10)
  const clicks = parseInt(insight.clicks || '0', 10)
  const reach = insight.reach ? parseInt(insight.reach, 10) : null
  const frequency = insight.frequency ? +parseFloat(insight.frequency).toFixed(2) : null
  const spend = +parseFloat(insight.spend || '0').toFixed(2)
  const lpv = actionValue(insight.actions, ['landing_page_view'])
  const leads = actionValue(insight.actions, LEAD_TYPES)
  return {
    impressions, clicks, reach, frequency, spend,
    landing_page_views: lpv, leads,
    ctr_pct: impressions > 0 ? +((clicks / impressions) * 100).toFixed(2) : 0,
    click_to_lpv_pct: clicks > 0 ? +((lpv / clicks) * 100).toFixed(2) : 0,
    lpv_to_lead_pct: lpv > 0 ? +((leads / lpv) * 100).toFixed(2) : 0,
    cpl: leads > 0 ? +(spend / leads).toFixed(2) : null,
    cost_per_lpv: lpv > 0 ? +(spend / lpv).toFixed(2) : null,
    cost_per_click: clicks > 0 ? +(spend / clicks).toFixed(2) : null,
  }
}

async function fetchMonthly() {
  const fields = 'campaign_id,campaign_name,impressions,clicks,ctr,spend,reach,frequency,actions,date_start,date_stop'
  const timeRange = JSON.stringify({ since: SINCE, until: UNTIL })
  const url = `${META_API}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&time_increment=monthly&limit=500&access_token=${accessToken}`
  return fetchPaged(url)
}

async function fetchWeekly() {
  const fields = 'campaign_id,campaign_name,impressions,clicks,ctr,spend,reach,frequency,actions,date_start,date_stop'
  const timeRange = JSON.stringify({ since: SINCE, until: UNTIL })
  const url = `${META_API}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&time_increment=7&limit=500&access_token=${accessToken}`
  return fetchPaged(url)
}

async function fetchAccountLevelMonthly() {
  const fields = 'impressions,clicks,ctr,spend,reach,frequency,actions,date_start,date_stop'
  const timeRange = JSON.stringify({ since: SINCE, until: UNTIL })
  const url = `${META_API}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=account&time_increment=monthly&limit=500&access_token=${accessToken}`
  return fetchPaged(url)
}

async function fetchAdsMonthly() {
  const fields = 'campaign_name,adset_name,ad_id,ad_name,impressions,clicks,ctr,spend,reach,frequency,actions,date_start,date_stop'
  const timeRange = JSON.stringify({ since: SINCE, until: UNTIL })
  const url = `${META_API}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=ad&time_increment=monthly&limit=500&access_token=${accessToken}`
  return fetchPaged(url)
}

async function fetchDealsByOrigin() {
  const { data, error } = await supabase
    .from('deals')
    .select('id, origin, stage, created_at, scheduled_at, visited_at, delivered_at, captured_at, lost_at')
    .gte('created_at', `${SINCE}T00:00:00`)
    .lte('created_at', `${UNTIL}T23:59:59`)
  if (error) throw error
  return data || []
}

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + yearStart.getUTCDay() + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

async function main() {
  const out: any = { generated_at: new Date().toISOString(), window: { since: SINCE, until: UNTIL } }

  console.error('→ Account-level monthly…')
  const accountMonthly = await fetchAccountLevelMonthly()
  out.account_monthly = accountMonthly.map((r: any) => ({
    date_start: r.date_start, date_stop: r.date_stop,
    ...summarize(r),
  }))

  console.error('→ Campaign monthly…')
  const campMonthly = await fetchMonthly()
  out.campaign_monthly = campMonthly.map((r: any) => ({
    campaign_id: r.campaign_id, campaign_name: r.campaign_name,
    classification: classify(r.campaign_name),
    date_start: r.date_start, date_stop: r.date_stop,
    ...summarize(r),
  }))

  console.error('→ Campaign weekly…')
  const campWeekly = await fetchWeekly()
  out.campaign_weekly = campWeekly.map((r: any) => ({
    campaign_id: r.campaign_id, campaign_name: r.campaign_name,
    classification: classify(r.campaign_name),
    week_iso: isoWeek(r.date_start),
    date_start: r.date_start, date_stop: r.date_stop,
    ...summarize(r),
  }))

  console.error('→ Ad-level monthly…')
  const adsMonthly = await fetchAdsMonthly()
  out.ads_monthly = adsMonthly.map((r: any) => ({
    campaign_name: r.campaign_name,
    classification: classify(r.campaign_name),
    adset_name: r.adset_name, ad_id: r.ad_id, ad_name: r.ad_name,
    date_start: r.date_start, date_stop: r.date_stop,
    ...summarize(r),
  }))

  console.error('→ Deals internos (4 meses)…')
  out.deals_internal = await fetchDealsByOrigin()

  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
