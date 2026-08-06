#!/usr/bin/env tsx
/**
 * Auditoría día-a-día por ad — 35 días (23 Abr → 27 May 2026).
 * Para validar la hipótesis "el volumen bajó desde que entraron videos nuevos".
 *
 * Salida: JSON a stdout.
 */
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

const SINCE = '2026-04-23'
const UNTIL = '2026-05-27'

const LEAD_TYPES = [
  'lead', 'complete_registration',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_complete_registration',
]

function getAction(actions: any[] | undefined, types: string[]): number {
  if (!actions) return 0
  for (const t of types) {
    const m = actions.find((a: any) => a.action_type === t)
    if (m && parseInt(m.value, 10) > 0) return parseInt(m.value, 10)
  }
  return 0
}

async function fetchPaged(initialUrl: string): Promise<any[]> {
  let url: string | null = initialUrl
  const out: any[] = []
  while (url) {
    const r = await fetch(url)
    if (!r.ok) {
      const e = await r.json()
      throw new Error(JSON.stringify(e))
    }
    const json: any = await r.json()
    out.push(...(json.data || []))
    url = json.paging?.next || null
  }
  return out
}

async function dailyByAd() {
  const fields = 'campaign_id,campaign_name,ad_id,ad_name,impressions,clicks,ctr,spend,actions,date_start'
  const timeRange = JSON.stringify({ since: SINCE, until: UNTIL })
  const url = `${META_API}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=ad&time_increment=1&limit=500&access_token=${accessToken}`
  const rows = await fetchPaged(url)
  return rows.map((r: any) => ({
    date: r.date_start,
    campaign_name: r.campaign_name,
    ad_name: r.ad_name,
    impressions: parseInt(r.impressions || '0', 10),
    clicks: parseInt(r.clicks || '0', 10),
    spend: +parseFloat(r.spend || '0').toFixed(2),
    leads: getAction(r.actions, LEAD_TYPES),
    landing_page_views: getAction(r.actions, ['landing_page_view']),
  }))
}

async function dailyByCampaign() {
  const fields = 'campaign_id,campaign_name,impressions,clicks,ctr,spend,actions,date_start'
  const timeRange = JSON.stringify({ since: SINCE, until: UNTIL })
  const url = `${META_API}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&time_increment=1&limit=500&access_token=${accessToken}`
  const rows = await fetchPaged(url)
  return rows.map((r: any) => ({
    date: r.date_start,
    campaign_name: r.campaign_name,
    impressions: parseInt(r.impressions || '0', 10),
    clicks: parseInt(r.clicks || '0', 10),
    spend: +parseFloat(r.spend || '0').toFixed(2),
    leads: getAction(r.actions, LEAD_TYPES),
    landing_page_views: getAction(r.actions, ['landing_page_view']),
  }))
}

async function main() {
  console.error('→ Daily by campaign…')
  const byCamp = await dailyByCampaign()
  console.error('→ Daily by ad…')
  const byAd = await dailyByAd()
  console.log(JSON.stringify({ daily_by_campaign: byCamp, daily_by_ad: byAd }, null, 2))
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
