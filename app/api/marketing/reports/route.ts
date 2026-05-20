import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchDailyInsights, fetchInsightsRange, saveDailySnapshot, checkTokenExpiry } from '@/lib/marketing/meta-ads'
import { buildFullGHLSnapshot, savePipelineSnapshot, saveCommercialActions, fetchCallStats } from '@/lib/marketing/ghl'
import { buildReportData } from '@/lib/marketing/aggregator'
import { sendReport } from '@/lib/marketing/send-report'
import type { ReportType, MetaDailySnapshot, GHLStageSnapshot, GHLCallStats, GHLCommercialActions, FunnelCRMSummary } from '@/lib/marketing/types'

interface FunnelRpcRow { metric: string; value: number | string }

async function fetchFunnelMetrics(from: string, to: string): Promise<FunnelCRMSummary['current']> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await supabase.rpc('get_funnel_metrics' as never, { p_from: from, p_to: to } as never)
  if (error) {
    console.warn('[reports] get_funnel_metrics:', error.message)
    return { class_registrations: 0, appraisal_requests: 0, appointments_scheduled: 0, visits_completed: 0, appraisals_delivered: 0, properties_captured: 0, deals_lost: 0 }
  }
  const map = Object.fromEntries(((data ?? []) as FunnelRpcRow[]).map(r => [r.metric, Number(r.value)]))
  return {
    class_registrations:    map.class_registrations    ?? 0,
    appraisal_requests:     map.appraisal_requests     ?? 0,
    appointments_scheduled: map.appointments_scheduled ?? 0,
    visits_completed:       map.visits_completed       ?? 0,
    appraisals_delivered:   map.appraisals_delivered   ?? 0,
    properties_captured:    map.properties_captured    ?? 0,
    deals_lost:             map.deals_lost             ?? 0,
  }
}

function calculatePreviousRange(from: string, to: string): { from: string; to: string } {
  const fromD = new Date(from + 'T00:00:00Z')
  const toD = new Date(to + 'T00:00:00Z')
  const diffDays = Math.round((toD.getTime() - fromD.getTime()) / (1000 * 60 * 60 * 24))
  const prevTo = new Date(fromD); prevTo.setUTCDate(prevTo.getUTCDate() - 1)
  const prevFrom = new Date(prevTo); prevFrom.setUTCDate(prevFrom.getUTCDate() - diffDays)
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) }
}

export const maxDuration = 60

/**
 * POST /api/marketing/reports
 * Body: { type: "daily" | "weekly" | "monthly", dateFrom?: string, dateTo?: string }
 * Manually triggers a report: fetches data, saves, and sends email.
 * If dateFrom/dateTo are provided, uses those dates instead of auto-calculating.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const type: ReportType = body.type || 'daily'

    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }

    let dateFrom: string
    let dateTo: string

    // Allow custom date range override
    if (body.dateFrom && body.dateTo) {
      dateFrom = body.dateFrom
      dateTo = body.dateTo
    } else if (body.dateFrom) {
      dateFrom = body.dateFrom
      dateTo = body.dateFrom
    } else {
      const today = new Date()
      if (type === 'daily') {
        const yesterday = new Date(today)
        yesterday.setDate(today.getDate() - 1)
        dateFrom = yesterday.toISOString().split('T')[0]
        dateTo = dateFrom
      } else if (type === 'weekly') {
        const datToDate = new Date(today)
        datToDate.setDate(today.getDate() - 1)
        const dateFromDate = new Date(datToDate)
        dateFromDate.setDate(datToDate.getDate() - 6)
        dateFrom = dateFromDate.toISOString().split('T')[0]
        dateTo = datToDate.toISOString().split('T')[0]
      } else {
        // monthly: last 30 days
        const datToDate = new Date(today)
        datToDate.setDate(today.getDate() - 1)
        const dateFromDate = new Date(today)
        dateFromDate.setDate(today.getDate() - 30)
        dateFrom = dateFromDate.toISOString().split('T')[0]
        dateTo = datToDate.toISOString().split('T')[0]
      }
    }

    // Data source error tracking
    const errors: Record<string, string> = {}

    // Fetch fresh data from all APIs
    let metaSnapshots: MetaDailySnapshot[] = []
    let pipelineSnapshots: GHLStageSnapshot[] = []
    let callStats: GHLCallStats | undefined
    let commercialActions: GHLCommercialActions | undefined

    try {
      if (dateFrom === dateTo) {
        metaSnapshots = await fetchDailyInsights(dateFrom)
      } else {
        metaSnapshots = await fetchInsightsRange(dateFrom, dateTo)
      }
      await saveDailySnapshot(metaSnapshots)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to fetch Meta data:', msg)
      errors.meta_ads = msg
    }

    try {
      const { stageSnapshots, commercialActions: ca } = await buildFullGHLSnapshot(dateFrom, dateTo)
      pipelineSnapshots = stageSnapshots
      commercialActions = ca
      await Promise.all([
        savePipelineSnapshot(stageSnapshots),
        saveCommercialActions(dateTo, ca),
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to fetch GHL pipeline data:', msg)
      errors.ghl_pipeline = msg
    }

    try {
      callStats = await fetchCallStats(dateFrom, dateTo)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('Failed to fetch GHL call stats:', msg)
      errors.ghl_calls = msg
    }

    // Check token expiry
    const tokenExpiresAt = await checkTokenExpiry()

    // Fase 6 — Embudo CRM (RPCs de Fase 3). Si falla no rompe el reporte.
    let funnelCRM: FunnelCRMSummary | undefined
    try {
      const prevRange = calculatePreviousRange(dateFrom, dateTo)
      const [cur, prev] = await Promise.all([
        fetchFunnelMetrics(dateFrom, dateTo),
        fetchFunnelMetrics(prevRange.from, prevRange.to),
      ])
      funnelCRM = {
        rangeLabel: dateFrom === dateTo
          ? `${dateFrom} vs ${prevRange.from}`
          : `${dateFrom} a ${dateTo} vs ${prevRange.from} a ${prevRange.to}`,
        current: cur,
        previous: prev,
      }
    } catch (err) {
      console.warn('[reports] funnel CRM fetch failed:', err)
      errors.funnel_crm = err instanceof Error ? err.message : 'unknown'
    }

    // Build and send report
    const reportData = buildReportData(type, dateFrom, dateTo, metaSnapshots, pipelineSnapshots, tokenExpiresAt, callStats, commercialActions, funnelCRM)
    const result = await sendReport(reportData)

    return NextResponse.json({
      success: result.success,
      error: result.error,
      report: {
        type,
        date_from: dateFrom,
        date_to: dateTo,
        meta_campaigns: metaSnapshots.length,
        pipeline_stages: pipelineSnapshots.length,
        call_stats: callStats,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
      },
    })
  } catch (error) {
    console.error('Report send error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
