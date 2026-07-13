import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-role'
import {
  getPropertyInquiryCounts,
  getInquiriesSummary,
  getUnidentifiedInquiries,
} from '@/lib/metrics/property-inquiries'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/metrics/property-inquiries?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Panel "Consultas por propiedad" de /metrics: ranking por propiedad con
 * desglose por portal + summary + grupo "Sin identificar".
 */
export async function GET(req: NextRequest) {
  await requirePermission('metrics.view')
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
    const range = { from, to }
    const [properties, summary, unidentified] = await Promise.all([
      getPropertyInquiryCounts(range),
      getInquiriesSummary(range),
      getUnidentifiedInquiries(range),
    ])
    return NextResponse.json({ properties, summary, unidentified })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    console.error('[api/metrics/property-inquiries]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
