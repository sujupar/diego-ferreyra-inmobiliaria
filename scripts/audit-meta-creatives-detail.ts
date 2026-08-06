#!/usr/bin/env tsx
/**
 * Investigación de creatividades Meta: por cada ad activo en TD/CG/HNWI
 *  - obtener creative (video_id, thumbnail_url, body, headline)
 *  - obtener video metadata desde Meta (title, length, source)
 *  - listar custom audiences disponibles (para diseñar remarketing)
 *  - inspeccionar pixel events recientes
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

const TD_CAMPAIGN_ID = '120233817515020656'
const CG_CAMPAIGN_ID = '120227913711270656'
const HNWI_CAMPAIGN_ID = '120241842039380656'

async function api(p: string) {
  const sep = p.includes('?') ? '&' : '?'
  const url = `${META_API}/${p}${sep}access_token=${accessToken}`
  const r = await fetch(url)
  if (!r.ok) {
    const e = await r.json()
    throw new Error(`${p}: ${JSON.stringify(e)}`)
  }
  return r.json()
}

async function getAdsForCampaign(campaignId: string) {
  const fields = 'id,name,status,effective_status,creative{id,video_id,thumbnail_url,object_story_spec,asset_feed_spec,title,body},adset_id,adset{name,targeting{custom_audiences,excluded_custom_audiences,age_min,age_max,genders,geo_locations,interests,flexible_spec}}'
  const r = await api(`${campaignId}/ads?fields=${encodeURIComponent(fields)}&limit=100`)
  return r.data || []
}

async function getVideoMeta(videoId: string) {
  try {
    const r = await api(`${videoId}?fields=title,length,description,created_time,source,picture,thumbnails{uri,is_preferred}`)
    return r
  } catch (e: any) {
    return { error: e.message }
  }
}

async function listCustomAudiences() {
  const fields = 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,description,retention_days,rule_aggregator,time_created,time_updated,operation_status'
  const r = await api(`${accountId}/customaudiences?fields=${fields}&limit=100`)
  return r.data || []
}

async function main() {
  const out: any = {}

  console.error('→ Ads para Tasación Directa…')
  out.td_ads = await getAdsForCampaign(TD_CAMPAIGN_ID)
  console.error('→ Ads para Clase Gratuita…')
  out.cg_ads = await getAdsForCampaign(CG_CAMPAIGN_ID)
  console.error('→ Ads para HNWI…')
  out.hnwi_ads = await getAdsForCampaign(HNWI_CAMPAIGN_ID)

  // Por cada ad activa o reciente, obtener metadata de video si tiene
  console.error('→ Resolviendo metadata de cada video…')
  const allAds = [...out.td_ads, ...out.cg_ads, ...out.hnwi_ads]
  out.videos = {}
  for (const ad of allAds) {
    const videoId = ad.creative?.video_id
      || ad.creative?.object_story_spec?.video_data?.video_id
      || ad.creative?.asset_feed_spec?.videos?.[0]?.video_id
    if (videoId && !out.videos[videoId]) {
      out.videos[videoId] = await getVideoMeta(videoId)
    }
  }

  console.error('→ Custom audiences disponibles…')
  out.audiences = await listCustomAudiences()

  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
