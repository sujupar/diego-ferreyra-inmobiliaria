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
  const spend = parseFloat(insight.spend)

  return {
    date: insight.date_start,
    campaign_id: insight.campaign_id,
    campaign_name: insight.campaign_name,
    impressions: parseInt(insight.impressions, 10),
    clicks: parseInt(insight.clicks, 10),
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
 * Save daily snapshots to Supabase (upsert by date + campaign_id)
 */
export async function saveDailySnapshot(snapshots: MetaDailySnapshot[]): Promise<void> {
  if (snapshots.length === 0) return

  const supabase = getSupabaseAdmin()

  const rows = snapshots.map(s => ({
    date: s.date,
    campaign_id: s.campaign_id,
    campaign_name: s.campaign_name,
    impressions: s.impressions,
    clicks: s.clicks,
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
