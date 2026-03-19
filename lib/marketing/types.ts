// ============================================================
// Meta Ads Types
// ============================================================

export interface MetaAdAction {
  action_type: string
  value: string
}

export interface MetaCampaignInsight {
  campaign_id: string
  campaign_name: string
  impressions: string
  clicks: string
  ctr: string
  spend: string
  actions?: MetaAdAction[]
  cost_per_action_type?: Array<{ action_type: string; value: string }>
  date_start: string
  date_stop: string
}

export interface MetaInsightsResponse {
  data: MetaCampaignInsight[]
  paging?: {
    cursors: { before: string; after: string }
    next?: string
  }
}

export interface MetaDailySnapshot {
  date: string
  campaign_id: string
  campaign_name: string
  impressions: number
  clicks: number
  ctr: number
  spend: number
  leads: number
  cost_per_lead: number | null
  raw_data: MetaCampaignInsight
}

export interface MetaTokenDebugInfo {
  data: {
    app_id: string
    type: string
    expires_at: number
    is_valid: boolean
    scopes: string[]
  }
}

// ============================================================
// GoHighLevel Types
// ============================================================

export interface GHLPipelineStage {
  id: string
  name: string
  position: number
}

export interface GHLPipeline {
  id: string
  name: string
  stages: GHLPipelineStage[]
  locationId: string
}

export interface GHLPipelinesResponse {
  pipelines: GHLPipeline[]
}

export interface GHLOpportunity {
  id: string
  name: string
  monetaryValue: number
  pipelineId: string
  pipelineStageId: string
  status: string
  contact: {
    id: string
    name: string
    email?: string
    phone?: string
  }
  createdAt: string
  updatedAt: string
}

export interface GHLOpportunitiesResponse {
  opportunities: GHLOpportunity[]
  meta: {
    total: number
    currentPage: number
    nextPage: number | null
    previousPage: number | null
  }
}

export interface GHLStageSnapshot {
  date: string
  pipeline_id: string
  pipeline_name: string
  stage_id: string
  stage_name: string
  contact_count: number
  new_contacts: number
  opportunity_value: number
}

// ============================================================
// GHL Call Types
// ============================================================

export interface GHLCallStats {
  total_calls: number
  answered_calls: number
  missed_calls: number
  total_duration_seconds: number
  average_duration_seconds: number
}

// ============================================================
// Report Types
// ============================================================

export type ReportType = 'daily' | 'weekly' | 'monthly'

export interface MetaSummary {
  total_impressions: number
  total_clicks: number
  average_ctr: number
  total_spend: number
  total_leads: number
  average_cost_per_lead: number | null
  campaigns: MetaDailySnapshot[]
}

export interface PipelineSummary {
  pipeline_name: string
  pipeline_id: string
  stages: Array<{
    stage_name: string
    stage_id: string
    contact_count: number
    new_contacts: number
    opportunity_value: number
  }>
  total_contacts: number
  total_new_contacts: number
  total_value: number
}

export interface ReportData {
  type: ReportType
  date_from: string
  date_to: string
  meta: MetaSummary
  pipelines: PipelineSummary[]
  call_stats?: GHLCallStats
  meta_token_expires_at?: number | null
}

export interface ReportSettings {
  id: string
  recipients: string[]
  daily_enabled: boolean
  weekly_enabled: boolean
  monthly_enabled: boolean
  updated_at: string
}
