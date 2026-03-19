import { NextResponse } from 'next/server'
import { fetchDailyInsights, fetchInsightsRange, saveDailySnapshot, getStoredMetrics } from '@/lib/marketing/meta-ads'

export const maxDuration = 30

/**
 * GET /api/marketing/meta?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns stored Meta Ads metrics for the given date range
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Missing "from" and "to" query parameters (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const data = await getStoredMetrics(from, to)
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Meta GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/marketing/meta
 * Body: { date?: string, from?: string, to?: string }
 * Fetches fresh data from Meta API and saves to Supabase
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const { date, from, to } = body

    let snapshots
    if (date) {
      snapshots = await fetchDailyInsights(date)
    } else if (from && to) {
      snapshots = await fetchInsightsRange(from, to)
    } else {
      // Default: yesterday
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dateStr = yesterday.toISOString().split('T')[0]
      snapshots = await fetchDailyInsights(dateStr)
    }

    await saveDailySnapshot(snapshots)

    return NextResponse.json({
      success: true,
      count: snapshots.length,
      data: snapshots,
    })
  } catch (error) {
    console.error('Meta POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
