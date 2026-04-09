import type {
  MetaDailySnapshot,
  MetaSummary,
  PipelineSummary,
  GHLStageSnapshot,
  GHLCallStats,
  GHLCommercialActions,
  ReportData,
  ReportType,
} from './types'

/**
 * Aggregate Meta Ads snapshots into a summary
 */
export function aggregateMetaData(snapshots: MetaDailySnapshot[]): MetaSummary {
  if (snapshots.length === 0) {
    return {
      total_impressions: 0,
      total_clicks: 0,
      average_ctr: 0,
      total_spend: 0,
      total_leads: 0,
      average_cost_per_lead: null,
      campaigns: [],
    }
  }

  // Group by campaign and sum
  const byCampaign = new Map<string, MetaDailySnapshot>()

  for (const snap of snapshots) {
    const existing = byCampaign.get(snap.campaign_id)
    if (existing) {
      existing.impressions += snap.impressions
      existing.clicks += snap.clicks
      existing.spend += snap.spend
      existing.leads += snap.leads
    } else {
      byCampaign.set(snap.campaign_id, { ...snap })
    }
  }

  // Recalculate derived fields per campaign
  const campaigns = Array.from(byCampaign.values()).map(c => ({
    ...c,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    cost_per_lead: c.leads > 0 ? c.spend / c.leads : null,
  }))

  const total_impressions = campaigns.reduce((sum, c) => sum + c.impressions, 0)
  const total_clicks = campaigns.reduce((sum, c) => sum + c.clicks, 0)
  const total_spend = campaigns.reduce((sum, c) => sum + c.spend, 0)
  const total_leads = campaigns.reduce((sum, c) => sum + c.leads, 0)

  return {
    total_impressions,
    total_clicks,
    average_ctr: total_impressions > 0 ? (total_clicks / total_impressions) * 100 : 0,
    total_spend,
    total_leads,
    average_cost_per_lead: total_leads > 0 ? total_spend / total_leads : null,
    campaigns,
  }
}

/**
 * Aggregate GHL pipeline data into summaries.
 * Uses the most recent snapshot for each pipeline/stage.
 */
export function aggregatePipelineData(snapshots: GHLStageSnapshot[]): PipelineSummary[] {
  if (snapshots.length === 0) return []

  // Group by pipeline, then by stage, keeping only the latest snapshot
  const pipelineMap = new Map<string, {
    pipeline_name: string
    stages: Map<string, { stage_name: string; contact_count: number; new_contacts: number; opportunity_value: number; date: string }>
  }>()

  for (const snap of snapshots) {
    if (!pipelineMap.has(snap.pipeline_id)) {
      pipelineMap.set(snap.pipeline_id, {
        pipeline_name: snap.pipeline_name,
        stages: new Map(),
      })
    }

    const pipeline = pipelineMap.get(snap.pipeline_id)!
    const existing = pipeline.stages.get(snap.stage_id)

    // Keep only the most recent snapshot for each stage
    if (!existing || snap.date > existing.date) {
      pipeline.stages.set(snap.stage_id, {
        stage_name: snap.stage_name,
        contact_count: snap.contact_count,
        new_contacts: snap.new_contacts || 0,
        opportunity_value: snap.opportunity_value,
        date: snap.date,
      })
    }
  }

  return Array.from(pipelineMap.entries()).map(([pipeline_id, p]) => {
    const stages = Array.from(p.stages.entries()).map(([stage_id, s]) => ({
      stage_id,
      stage_name: s.stage_name,
      contact_count: s.contact_count,
      new_contacts: s.new_contacts,
      opportunity_value: s.opportunity_value,
    }))

    return {
      pipeline_id,
      pipeline_name: p.pipeline_name,
      stages,
      total_contacts: stages.reduce((sum, s) => sum + s.contact_count, 0),
      total_new_contacts: stages.reduce((sum, s) => sum + s.new_contacts, 0),
      total_value: stages.reduce((sum, s) => sum + s.opportunity_value, 0),
    }
  })
}

/**
 * Build a complete report from raw snapshots
 */
export function buildReportData(
  type: ReportType,
  dateFrom: string,
  dateTo: string,
  metaSnapshots: MetaDailySnapshot[],
  pipelineSnapshots: GHLStageSnapshot[],
  tokenExpiresAt?: number | null,
  callStats?: GHLCallStats,
  commercialActions?: GHLCommercialActions
): ReportData {
  return {
    type,
    date_from: dateFrom,
    date_to: dateTo,
    meta: aggregateMetaData(metaSnapshots),
    pipelines: aggregatePipelineData(pipelineSnapshots),
    meta_token_expires_at: tokenExpiresAt,
    call_stats: callStats,
    commercial_actions: commercialActions,
  }
}
