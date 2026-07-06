import { NextRequest, NextResponse } from 'next/server'
import { getFunnelByCampaign } from '@/lib/metrics/funnel'
import { requireAuth } from '@/lib/auth/require-role'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/metrics/funnel-by-campaign?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns Meta Ads metrics aggregated per campaign for the date range,
 * including funnel_type classification (clase_gratuita | tasacion | otro).
 */
export async function GET(req: NextRequest) {
  // Cierra la exposición anónima de métricas de campañas (ad-spend por campaña).
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
    const data = await getFunnelByCampaign({ from, to })
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    console.error('[api/metrics/funnel-by-campaign]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
