import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type {
  MetaCampaignInsight,
  MetaInsightsResponse,
  MetaDailySnapshot,
  MetaTokenDebugInfo,
} from './types'

const META_API_BASE = 'https://graph.facebook.com/v21.0'

function getMetaConfig() {
  const adAccountId = process.env.META_AD_ACCOUNT_ID
  const accessToken = process.env.META_ACCESS_TOKEN
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET

  if (!adAccountId || !accessToken) {
    throw new Error('Missing META_AD_ACCOUNT_ID or META_ACCESS_TOKEN environment variables')
  }

  // Ensure act_ prefix
  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`

  return { accountId, accessToken, appId, appSecret }
}

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Meta uses different action_types depending on campaign objective.
// We check multiple types in priority order.
const LEAD_ACTION_TYPES = [
  'lead',
  'complete_registration',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_complete_registration',
]

// landing_page_view = el usuario llegó a la página (vs link_click que cuenta
// el clic en el ad). Es la métrica que pidió el usuario para "visitas a la
// página". Si Meta no la reporta (campañas viejas), cae 0.
const LANDING_PAGE_VIEW_ACTION = 'landing_page_view'

function parseInsight(insight: MetaCampaignInsight): MetaDailySnapshot {
  let leadCount = 0
  if (insight.actions) {
    for (const actionType of LEAD_ACTION_TYPES) {
      const match = insight.actions.find(a => a.action_type === actionType)
      if (match) {
        leadCount = parseInt(match.value, 10)
        if (leadCount > 0) break
      }
    }
  }

  let landingPageViews = 0
  if (insight.actions) {
    const lpv = insight.actions.find(a => a.action_type === LANDING_PAGE_VIEW_ACTION)
    if (lpv) landingPageViews = parseInt(lpv.value, 10) || 0
  }

  const spend = parseFloat(insight.spend)

  return {
    date: insight.date_start,
    campaign_id: insight.campaign_id,
    campaign_name: insight.campaign_name,
    impressions: parseInt(insight.impressions, 10),
    clicks: parseInt(insight.clicks, 10),
    landing_page_views: landingPageViews,
    ctr: parseFloat(insight.ctr),
    spend,
    leads: leadCount,
    cost_per_lead: leadCount > 0 ? spend / leadCount : null,
    raw_data: insight,
  }
}

/**
 * Fetch campaign insights from Meta Marketing API for a specific date
 */
export async function fetchDailyInsights(date: string): Promise<MetaDailySnapshot[]> {
  const { accountId, accessToken } = getMetaConfig()

  const fields = 'campaign_id,campaign_name,impressions,clicks,ctr,spend,actions,cost_per_action_type'
  const timeRange = JSON.stringify({ since: date, until: date })

  const url = `${META_API_BASE}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&access_token=${accessToken}`

  const response = await fetch(url)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Meta API error: ${JSON.stringify(error)}`)
  }

  const data: MetaInsightsResponse = await response.json()
  return data.data.map(parseInsight)
}

/**
 * Fetch campaign insights for a date range
 */
export async function fetchInsightsRange(startDate: string, endDate: string): Promise<MetaDailySnapshot[]> {
  const { accountId, accessToken } = getMetaConfig()

  const fields = 'campaign_id,campaign_name,impressions,clicks,ctr,spend,actions,cost_per_action_type'
  const timeRange = JSON.stringify({ since: startDate, until: endDate })

  const url = `${META_API_BASE}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&access_token=${accessToken}`

  const response = await fetch(url)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Meta API error: ${JSON.stringify(error)}`)
  }

  const data: MetaInsightsResponse = await response.json()
  return data.data.map(parseInsight)
}

/**
 * Arma la URL de insights con desglose DIARIO.
 *
 * Separada del fetch para poder testearla sin pegarle a Meta: lo que se rompe
 * acá es la URL (olvidar `time_increment`, no pedir `date_start`), no la red.
 *
 * OJO — la diferencia con `fetchInsightsRange`: sin `time_increment=1` Meta
 * devuelve UNA fila agregada por campaña para todo el rango, y como parseInsight
 * toma `date_start`, meses de gasto quedarían apilados en un solo día.
 */
export function buildDailyInsightsUrl(
  accountId: string, accessToken: string, since: string, until: string,
): string {
  const fields = 'date_start,campaign_id,campaign_name,impressions,clicks,ctr,spend,actions,cost_per_action_type'
  const params = new URLSearchParams({
    fields,
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    level: 'campaign',
    limit: '500',
    access_token: accessToken,
  })
  return `${META_API_BASE}/${accountId}/insights?${params.toString()}`
}

/**
 * Trae una fila por campaña Y POR DÍA para el rango pedido, siguiendo la
 * paginación de Meta (un trimestre con varias campañas pasa las 500 filas).
 */
export async function fetchDailyInsightsRange(
  since: string, until: string,
): Promise<MetaDailySnapshot[]> {
  const { accountId, accessToken } = getMetaConfig()
  let url: string | null = buildDailyInsightsUrl(accountId, accessToken, since, until)
  const out: MetaDailySnapshot[] = []

  while (url) {
    const response: Response = await fetch(url)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`Meta API error: ${JSON.stringify(error)}`)
    }
    const data: MetaInsightsResponse & { paging?: { next?: string } } = await response.json()
    out.push(...data.data.map(parseInsight))
    url = data.paging?.next ?? null
  }

  return out
}

/**
 * Save daily snapshots to Supabase (upsert by date + campaign_id)
 */
export async function saveDailySnapshot(snapshots: MetaDailySnapshot[]): Promise<void> {
  if (snapshots.length === 0) return

  const supabase = getSupabaseAdmin()

  // `fetched_at` se escribe SIEMPRE, también al ACTUALIZAR una fila que ya
  // existía. El DEFAULT de la columna solo corre en el INSERT, así que sin esto
  // una fila refrescada conserva la marca de la primera vez — y entonces no hay
  // manera de saber si la sincronización sigue viva. Ese es exactamente el modo
  // de falla que dejó la inversión cortada dos meses y medio sin que nadie lo
  // notara (ver CLAUDE.md).
  const fetchedAt = new Date().toISOString()

  const rows = snapshots.map(s => ({
    fetched_at: fetchedAt,
    date: s.date,
    campaign_id: s.campaign_id,
    campaign_name: s.campaign_name,
    impressions: s.impressions,
    clicks: s.clicks,
    landing_page_views: s.landing_page_views,
    ctr: s.ctr,
    spend: s.spend,
    leads: s.leads,
    cost_per_lead: s.cost_per_lead,
    raw_data: s.raw_data as unknown as Database['public']['Tables']['meta_ads_daily']['Insert']['raw_data'],
  }))

  const { error } = await supabase
    .from('meta_ads_daily')
    .upsert(rows, { onConflict: 'date,campaign_id' })

  if (error) {
    throw new Error(`Failed to save Meta snapshots: ${error.message}`)
  }
}

/**
 * Get stored metrics from Supabase for a date range
 */
export async function getStoredMetrics(startDate: string, endDate: string) {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('meta_ads_daily')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch Meta metrics: ${error.message}`)
  }

  return data
}

/**
 * Check Meta access token expiration
 * Returns the expiry timestamp (seconds since epoch), or null if check fails
 */
export async function checkTokenExpiry(): Promise<number | null> {
  try {
    const { accessToken, appId, appSecret } = getMetaConfig()

    if (!appId || !appSecret) return null

    const url = `${META_API_BASE}/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
    const response = await fetch(url)

    if (!response.ok) return null

    const data: MetaTokenDebugInfo = await response.json()
    return data.data.expires_at || null
  } catch {
    return null
  }
}
