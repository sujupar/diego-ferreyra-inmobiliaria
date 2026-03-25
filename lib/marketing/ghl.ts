import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type {
  GHLPipeline,
  GHLPipelinesResponse,
  GHLOpportunitiesResponse,
  GHLStageSnapshot,
  GHLCallStats,
} from './types'

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const TARGET_PIPELINE_NAME = 'Embudo Propietarios LP'

function getGHLConfig() {
  const apiKey = process.env.GHL_API_KEY
  const locationId = process.env.GHL_LOCATION_ID

  if (!apiKey || !locationId) {
    throw new Error('Missing GHL_API_KEY or GHL_LOCATION_ID environment variables')
  }

  return { apiKey, locationId }
}

function getGHLHeaders() {
  const { apiKey } = getGHLConfig()
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json',
  }
}

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Fetch all pipelines and their stages
 */
export async function fetchPipelines(): Promise<GHLPipeline[]> {
  const { locationId } = getGHLConfig()

  const response = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`, {
    headers: getGHLHeaders(),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GHL Pipelines API error (${response.status}): ${error}`)
  }

  const data: GHLPipelinesResponse = await response.json()
  return data.pipelines
}

/**
 * Fetch opportunities for a specific pipeline, with pagination
 */
export async function fetchOpportunitiesByPipeline(pipelineId: string) {
  const { locationId } = getGHLConfig()
  const allOpportunities: GHLOpportunitiesResponse['opportunities'] = []

  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = `${GHL_API_BASE}/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&limit=100&page=${page}`

    const response = await fetch(url, {
      method: 'GET',
      headers: getGHLHeaders(),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`GHL Opportunities API error (${response.status}): ${error}`)
    }

    const data: GHLOpportunitiesResponse = await response.json()
    allOpportunities.push(...data.opportunities)

    hasMore = data.meta.nextPage !== null
    page++

    if (page > 50) break
  }

  return allOpportunities
}

/**
 * Build a snapshot of pipeline stages with total counts AND new contacts for a date range
 */
export async function buildPipelineSnapshot(dateFrom: string, dateTo: string): Promise<GHLStageSnapshot[]> {
  const allPipelines = await fetchPipelines()
  const pipelines = allPipelines.filter(p => p.name === TARGET_PIPELINE_NAME)

  if (pipelines.length === 0) {
    console.warn(`Pipeline "${TARGET_PIPELINE_NAME}" not found`)
    return []
  }

  const snapshots: GHLStageSnapshot[] = []
  const startOfDay = new Date(dateFrom + 'T00:00:00Z')
  const endOfDay = new Date(dateTo + 'T23:59:59Z')

  for (const pipeline of pipelines) {
    const opportunities = await fetchOpportunitiesByPipeline(pipeline.id)

    const stageCounts = new Map<string, { count: number; newCount: number; value: number }>()

    for (const stage of pipeline.stages) {
      stageCounts.set(stage.id, { count: 0, newCount: 0, value: 0 })
    }

    for (const opp of opportunities) {
      const current = stageCounts.get(opp.pipelineStageId)
      if (current) {
        current.count++
        current.value += opp.monetaryValue || 0

        // Check if created within the date range
        const createdAt = new Date(opp.createdAt)
        if (createdAt >= startOfDay && createdAt <= endOfDay) {
          current.newCount++
        }
      }
    }

    for (const stage of pipeline.stages) {
      const counts = stageCounts.get(stage.id) || { count: 0, newCount: 0, value: 0 }
      snapshots.push({
        date: dateTo,
        pipeline_id: pipeline.id,
        pipeline_name: pipeline.name,
        stage_id: stage.id,
        stage_name: stage.name,
        contact_count: counts.count,
        new_contacts: counts.newCount,
        opportunity_value: counts.value,
      })
    }
  }

  return snapshots
}

/**
 * Fetch call statistics from GHL for a date range.
 *
 * GHL conversations API notes:
 * - Conversations are TYPE_PHONE, not TYPE_CALL
 * - Calls are identified by lastMessageType === 'TYPE_CALL'
 * - Date fields (dateAdded, lastMessageDate) are epoch milliseconds
 * - The API date filter params also expect epoch milliseconds
 * - Call detail (duration, status) is not available in API v2021-07-28
 */
export async function fetchCallStats(dateFrom: string, dateTo: string): Promise<GHLCallStats> {
  const { locationId } = getGHLConfig()
  const stats: GHLCallStats = {
    total_calls: 0,
    answered_calls: 0,
    missed_calls: 0,
    total_duration_seconds: 0,
    average_duration_seconds: 0,
  }

  try {
    // GHL uses epoch milliseconds for date filtering
    const startEpoch = new Date(dateFrom + 'T00:00:00Z').getTime()
    const endEpoch = new Date(dateTo + 'T23:59:59Z').getTime()

    // Paginate through all conversations to find calls
    // We search all conversations (not filtered by type) and look for lastMessageType === TYPE_CALL
    let allCallConversations: Array<Record<string, unknown>> = []
    let hasMore = true
    let startAfterCursor: number | null = null
    let startAfterIdCursor: string | null = null
    let page = 0

    while (hasMore && page < 40) {
      let url = `${GHL_API_BASE}/conversations/search?locationId=${locationId}&limit=100`
      if (startAfterCursor !== null && startAfterIdCursor !== null) {
        url += `&startAfter=${startAfterCursor}&startAfterId=${startAfterIdCursor}`
      }

      const response = await fetch(url, { headers: getGHLHeaders() })

      if (!response.ok) {
        const errBody = await response.text()
        console.error(`GHL Calls API error (${response.status}):`, errBody)
        throw new Error(`GHL conversations HTTP ${response.status}: ${errBody.substring(0, 200)}`)
      }

      const data = await response.json()
      const conversations: Array<Record<string, unknown>> = data.conversations || []

      if (conversations.length === 0) break

      // Filter for call conversations within date range
      for (const conv of conversations) {
        if (conv.lastMessageType !== 'TYPE_CALL') continue

        const msgDate = (conv.lastMessageDate as number) || 0
        if (msgDate >= startEpoch && msgDate <= endEpoch) {
          allCallConversations.push(conv)
        }
      }

      // Check if oldest conversation in this batch is before our start date
      // If so, we've gone far enough back in time
      const oldestInBatch = conversations[conversations.length - 1]
      const oldestDate = (oldestInBatch.lastMessageDate as number) || (oldestInBatch.dateAdded as number) || 0
      if (oldestDate < startEpoch) {
        // All remaining conversations are older than our range
        break
      }

      // Cursor-based pagination using sort field
      const lastConv = conversations[conversations.length - 1]
      const sortArr = lastConv.sort as number[] | undefined
      if (sortArr && sortArr.length > 0) {
        startAfterCursor = sortArr[0]
        startAfterIdCursor = lastConv.id as string
      } else {
        break
      }

      hasMore = conversations.length >= 100
      page++
    }

    console.log(`GHL calls: found ${allCallConversations.length} call conversations in date range (scanned ${page + 1} pages)`)

    // Count all call conversations as total calls
    // GHL API v2021-07-28 doesn't provide call duration or answered/missed status
    stats.total_calls = allCallConversations.length
    // Without call status data, we count all as answered (they had a call interaction)
    stats.answered_calls = allCallConversations.length
  } catch (err) {
    console.error('GHL Calls fetch error:', err)
  }

  return stats
}

/**
 * Save pipeline snapshots to Supabase (upsert by date + pipeline_id + stage_id)
 */
export async function savePipelineSnapshot(snapshots: GHLStageSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return

  const supabase = getSupabaseAdmin()

  const rows = snapshots.map(s => ({
    date: s.date,
    pipeline_id: s.pipeline_id,
    pipeline_name: s.pipeline_name,
    stage_id: s.stage_id,
    stage_name: s.stage_name,
    contact_count: s.contact_count,
    new_contacts: s.new_contacts,
    opportunity_value: s.opportunity_value,
  }))

  const { error } = await supabase
    .from('ghl_pipeline_daily')
    .upsert(rows, { onConflict: 'date,pipeline_id,stage_id' })

  if (error) {
    throw new Error(`Failed to save GHL snapshots: ${error.message}`)
  }
}

/**
 * Get stored pipeline data from Supabase for a date range
 */
export async function getStoredPipelineData(startDate: string, endDate: string) {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('ghl_pipeline_daily')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch GHL pipeline data: ${error.message}`)
  }

  return data
}
