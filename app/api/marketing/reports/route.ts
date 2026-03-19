import { NextResponse } from 'next/server'
import { fetchDailyInsights, fetchInsightsRange, saveDailySnapshot, checkTokenExpiry } from '@/lib/marketing/meta-ads'
import { buildPipelineSnapshot, savePipelineSnapshot, fetchCallStats } from '@/lib/marketing/ghl'
import { buildReportData } from '@/lib/marketing/aggregator'
import { sendReport } from '@/lib/marketing/send-report'
import type { ReportType, MetaDailySnapshot, GHLStageSnapshot, GHLCallStats } from '@/lib/marketing/types'

export const maxDuration = 60

/**
 * POST /api/marketing/reports
 * Body: { type: "daily" | "weekly" | "monthly" }
 * Manually triggers a report: fetches data, saves, and sends email
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const type: ReportType = body.type || 'daily'

    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }

    const today = new Date()
    let dateFrom: string
    let dateTo: string

    if (type === 'daily') {
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      dateFrom = yesterday.toISOString().split('T')[0]
      dateTo = dateFrom
    } else if (type === 'weekly') {
      const weekAgo = new Date(today)
      weekAgo.setDate(today.getDate() - 7)
      dateFrom = weekAgo.toISOString().split('T')[0]
      dateTo = new Date(today.getTime() - 86400000).toISOString().split('T')[0]
    } else {
      // monthly: last 30 days
      const monthAgo = new Date(today)
      monthAgo.setDate(today.getDate() - 30)
      dateFrom = monthAgo.toISOString().split('T')[0]
      dateTo = new Date(today.getTime() - 86400000).toISOString().split('T')[0]
    }

    // Fetch fresh data from all APIs
    let metaSnapshots: MetaDailySnapshot[] = []
    let pipelineSnapshots: GHLStageSnapshot[] = []
    let callStats: GHLCallStats | undefined

    try {
      if (type === 'daily') {
        metaSnapshots = await fetchDailyInsights(dateFrom)
      } else {
        metaSnapshots = await fetchInsightsRange(dateFrom, dateTo)
      }
      await saveDailySnapshot(metaSnapshots)
    } catch (err) {
      console.error('Failed to fetch Meta data:', err)
    }

    try {
      pipelineSnapshots = await buildPipelineSnapshot(dateFrom, dateTo)
      await savePipelineSnapshot(pipelineSnapshots)
    } catch (err) {
      console.error('Failed to fetch GHL data:', err)
    }

    try {
      callStats = await fetchCallStats(dateFrom, dateTo)
    } catch (err) {
      console.error('Failed to fetch GHL call stats:', err)
    }

    // Check token expiry
    const tokenExpiresAt = await checkTokenExpiry()

    // Build and send report
    const reportData = buildReportData(type, dateFrom, dateTo, metaSnapshots, pipelineSnapshots, tokenExpiresAt, callStats)
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
