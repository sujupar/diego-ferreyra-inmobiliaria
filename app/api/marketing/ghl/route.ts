import { NextResponse } from 'next/server'
import { buildFullGHLSnapshot, savePipelineSnapshot, saveCommercialActions, getStoredPipelineData, getStoredCommercialActions, fetchCallStats } from '@/lib/marketing/ghl'

export const maxDuration = 30

/**
 * GET /api/marketing/ghl?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns stored GHL pipeline data and live call stats for the given date range
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

    const [data, callStats, commercialActions] = await Promise.all([
      getStoredPipelineData(from, to),
      fetchCallStats(from, to).catch(() => null),
      getStoredCommercialActions(from, to).catch(() => null),
    ])

    return NextResponse.json({ data, call_stats: callStats, commercial_actions: commercialActions })
  } catch (error) {
    console.error('GHL GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/marketing/ghl
 * Body: { from?: string, to?: string, date?: string }
 * Fetches fresh pipeline data from GHL and saves to Supabase
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}))
    const today = new Date().toISOString().split('T')[0]
    const dateFrom = body.from || body.date || today
    const dateTo = body.to || body.date || today

    const { stageSnapshots, commercialActions } = await buildFullGHLSnapshot(dateFrom, dateTo)
    await Promise.all([
      savePipelineSnapshot(stageSnapshots),
      saveCommercialActions(dateTo, commercialActions),
    ])

    return NextResponse.json({
      success: true,
      count: stageSnapshots.length,
      data: stageSnapshots,
      commercial_actions: commercialActions,
    })
  } catch (error) {
    console.error('GHL POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
