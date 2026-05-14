/**
 * Constructor de campañas Meta Ads para propiedades.
 *
 * Flow:
 *   1. createCampaignForProperty(property) →
 *      - Crea Campaign (OUTCOME_LEADS, PAUSED)
 *      - Sube imagen hero → adimages
 *      - Crea AdCreative (link a la landing /p/[slug])
 *      - Crea AdSet (targeting + budget + optimization_goal LEAD_GENERATION)
 *      - Crea Ad linkeando adset + creative
 *      - Smoke test de landing → si 200, activa la campaign
 *      - Persiste todo en property_meta_campaigns
 *   2. pauseCampaign(campaignId) → PUT status=PAUSED
 *   3. activateCampaign(campaignId) → PUT status=ACTIVE
 *   4. fetchCampaignInsights(campaignId, since) → GET /insights
 *
 * Meta Marketing API v21.0. Reusa el access token del módulo meta-ads.ts.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { Property } from '@/lib/portals/types'
import { decideBudget } from './budget-rules'
import { decideTargeting } from './targeting-rules'
import { buildAdCopy } from './copy-templates'
import { getUsdToArs } from './usd-rate'

const META_API = 'https://graph.facebook.com/v21.0'

function getMeta() {
  const accountIdRaw = process.env.META_AD_ACCOUNT_ID
  const accessToken = process.env.META_ACCESS_TOKEN
  const pageId = process.env.META_PAGE_ID
  if (!accountIdRaw || !accessToken) {
    throw new Error('META_AD_ACCOUNT_ID o META_ACCESS_TOKEN faltantes')
  }
  if (!pageId) {
    throw new Error('META_PAGE_ID faltante (necesario para vincular ads a la página)')
  }
  const accountId = accountIdRaw.startsWith('act_') ? accountIdRaw : `act_${accountIdRaw}`
  return { accountId, accessToken, pageId }
}

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'
}

class MetaApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryable: boolean) {
    super(message)
  }
}

async function metaFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { accessToken } = getMeta()
  const url = path.startsWith('http') ? path : `${META_API}${path}`
  const separator = url.includes('?') ? '&' : '?'
  const fullUrl = `${url}${separator}access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(fullUrl, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    const retryable = res.status >= 500 || res.status === 429
    throw new MetaApiError(`Meta ${res.status} ${path}: ${text}`, res.status, retryable)
  }
  return res.json() as Promise<T>
}

export interface CampaignResult {
  campaignId: string
  adsetId: string
  adIds: string[]
  budgetDailyArs: number
  landingUrl: string
}

/**
 * Sube una foto a Meta como ad image. Devuelve el hash.
 */
async function uploadAdImage(photoUrl: string): Promise<string> {
  const { accountId } = getMeta()
  const res = await metaFetch<{ images: Record<string, { hash: string }> }>(
    `/${accountId}/adimages?url=${encodeURIComponent(photoUrl)}`,
    { method: 'POST' },
  )
  const first = Object.values(res.images)[0]
  if (!first?.hash) throw new MetaApiError('No image hash en respuesta', 500, true)
  return first.hash
}

export async function createCampaignForProperty(
  property: Property,
): Promise<CampaignResult> {
  if (!property.public_slug) {
    throw new Error('Property sin public_slug — asignar antes de crear campaign')
  }
  if (!property.photos || property.photos.length === 0) {
    throw new Error('Property sin fotos — no se puede crear ad creative')
  }
  if (property.latitude == null || property.longitude == null) {
    throw new Error('Property sin lat/lng — no se puede armar targeting')
  }

  const { accountId, pageId } = getMeta()
  const landingUrl = `${getAppUrl()}/p/${property.public_slug}`

  // Tipo de cambio USD→ARS fresco (Bluelytics, cached 1h)
  const { rate: usdToArs, source: rateSource } = await getUsdToArs()

  const budget = decideBudget(property.asking_price, property.currency, usdToArs)
  const targeting = decideTargeting(property, usdToArs)
  const copy = buildAdCopy(property)

  // 1. Crear Campaign (paused)
  // NOTA: en Argentina las campañas de real estate NO requieren la categoría
  // especial HOUSING (es una regulación específica de EEUU/Canadá). Diego ya
  // corre campañas residenciales sin esta categoría exitosamente. Si en algún
  // momento Meta lo exige, se agrega aquí especial_ad_categories: ['HOUSING'].
  const campaign = await metaFetch<{ id: string }>(`/${accountId}/campaigns`, {
    method: 'POST',
    body: JSON.stringify({
      name: `[Auto] ${property.title ?? property.address} (${property.public_slug})`,
      objective: 'OUTCOME_LEADS',
      status: 'PAUSED',
      special_ad_categories: [], // Sin restricciones especiales en AR
      buying_type: 'AUCTION',
    }),
  })

  // 2. Subir imagen hero
  const imageHash = await uploadAdImage(property.photos[0])

  // 3. Crear AdCreative
  const creative = await metaFetch<{ id: string }>(`/${accountId}/adcreatives`, {
    method: 'POST',
    body: JSON.stringify({
      name: `Hero ${property.public_slug}`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          image_hash: imageHash,
          link: landingUrl,
          message: copy.primaryText,
          name: copy.headline,
          description: copy.description,
          call_to_action: { type: 'LEARN_MORE', value: { link: landingUrl } },
        },
      },
    }),
  })

  // 4. Crear AdSet (con conversion location WEBSITE para que apunte a la landing)
  const startTime = new Date(Date.now() + 60_000).toISOString() // 1min en el futuro
  const adset = await metaFetch<{ id: string }>(`/${accountId}/adsets`, {
    method: 'POST',
    body: JSON.stringify({
      name: `AdSet ${property.public_slug}`,
      campaign_id: campaign.id,
      daily_budget: Math.round(budget.dailyArs * 100), // Meta espera centavos
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LEAD_GENERATION',
      destination_type: 'WEBSITE',
      targeting: targeting.spec,
      status: 'PAUSED',
      start_time: startTime,
    }),
  })

  // 5. Crear Ad
  const ad = await metaFetch<{ id: string }>(`/${accountId}/ads`, {
    method: 'POST',
    body: JSON.stringify({
      name: `Ad ${property.public_slug}`,
      adset_id: adset.id,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    }),
  })

  // 6. Smoke test de la landing antes de activar
  const landingOk = await smokeTestLanding(landingUrl)

  // 7. Persistir en DB
  const supabase = getSupabase()
  await supabase.from('property_meta_campaigns').insert({
    property_id: property.id,
    campaign_id: campaign.id,
    adset_id: adset.id,
    ad_ids: [ad.id],
    status: landingOk ? 'provisioning' : 'failed',
    budget_daily: budget.dailyArs,
    budget_currency: 'ARS',
    targeting: targeting.spec as never,
    copy: copy as never,
    landing_url: landingUrl,
    last_error: landingOk ? null : 'Smoke test de landing falló',
  })

  // 8. Si la landing responde OK, activar campaign + adset + ad
  if (landingOk) {
    await activateCampaign(campaign.id, adset.id, [ad.id])
    await supabase
      .from('property_meta_campaigns')
      .update({ status: 'active' })
      .eq('campaign_id', campaign.id)
  }

  return {
    campaignId: campaign.id,
    adsetId: adset.id,
    adIds: [ad.id],
    budgetDailyArs: budget.dailyArs,
    landingUrl,
  }
}

async function smokeTestLanding(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Activa campaign + adset + ads. Se llama después del smoke test.
 */
export async function activateCampaign(
  campaignId: string,
  adsetId: string,
  adIds: string[],
): Promise<void> {
  // El orden importa: primero campaign, después adset, después ads
  await metaFetch(`/${campaignId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ACTIVE' }),
  })
  await metaFetch(`/${adsetId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ACTIVE' }),
  })
  for (const adId of adIds) {
    await metaFetch(`/${adId}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'ACTIVE' }),
    })
  }
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  await metaFetch(`/${campaignId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'PAUSED' }),
  })
  const supabase = getSupabase()
  await supabase
    .from('property_meta_campaigns')
    .update({ status: 'paused', paused_at: new Date().toISOString() })
    .eq('campaign_id', campaignId)
}

export async function archiveCampaign(campaignId: string): Promise<void> {
  await metaFetch(`/${campaignId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ARCHIVED' }),
  })
  const supabase = getSupabase()
  await supabase
    .from('property_meta_campaigns')
    .update({ status: 'archived' })
    .eq('campaign_id', campaignId)
}

export interface CampaignDailyInsight {
  date: string
  impressions: number
  clicks: number
  ctr: number | null
  spend: number
  leads: number
  cost_per_lead: number | null
  reach: number
  raw: Record<string, unknown>
}

interface MetaInsightRow {
  date_start: string
  date_stop: string
  impressions: string
  clicks: string
  ctr: string
  spend: string
  reach: string
  actions?: Array<{ action_type: string; value: string }>
  cost_per_action_type?: Array<{ action_type: string; value: string }>
}

const LEAD_ACTION_TYPES = [
  'lead',
  'complete_registration',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_complete_registration',
  'onsite_conversion.lead_grouped',
]

function parseLeadCount(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0
  for (const t of LEAD_ACTION_TYPES) {
    const a = actions.find(x => x.action_type === t)
    if (a) {
      const n = parseInt(a.value, 10)
      if (n > 0) return n
    }
  }
  return 0
}

export async function fetchCampaignInsights(
  campaignId: string,
  since: Date,
): Promise<CampaignDailyInsight[]> {
  const sinceStr = since.toISOString().slice(0, 10)
  const until = new Date().toISOString().slice(0, 10)
  const fields = 'date_start,date_stop,impressions,clicks,ctr,spend,reach,actions,cost_per_action_type'
  const params = new URLSearchParams({
    fields,
    time_increment: '1',
    time_range: JSON.stringify({ since: sinceStr, until }),
    level: 'campaign',
  })
  const res = await metaFetch<{ data: MetaInsightRow[] }>(
    `/${campaignId}/insights?${params.toString()}`,
  )

  return (res.data ?? []).map(row => {
    const impressions = parseInt(row.impressions, 10) || 0
    const clicks = parseInt(row.clicks, 10) || 0
    const ctr = row.ctr ? parseFloat(row.ctr) : null
    const spend = parseFloat(row.spend) || 0
    const reach = parseInt(row.reach, 10) || 0
    const leads = parseLeadCount(row.actions)
    const cost_per_lead = leads > 0 ? spend / leads : null
    return {
      date: row.date_start,
      impressions,
      clicks,
      ctr,
      spend,
      leads,
      cost_per_lead,
      reach,
      raw: row as unknown as Record<string, unknown>,
    }
  })
}

export { MetaApiError }
