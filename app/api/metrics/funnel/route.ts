import { NextRequest, NextResponse } from 'next/server'
import { getFunnelComparison } from '@/lib/metrics/comparison'
import { requireAuth } from '@/lib/auth/require-role'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/metrics/funnel?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns funnel metrics for the range + the previous range of the same
 * length + delta % per metric.
 */
export async function GET(req: NextRequest) {
  // Cierra la exposición anónima de métricas de negocio (BI/ad-spend).
  await requireAuth()
  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')

  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: 'from/to required as YYYY-MM-DD' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be <= to' }, { status: 400 })
  }

  try {
    const data = await getFunnelComparison({ from, to })
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    console.error('[api/metrics/funnel]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
