import { NextRequest, NextResponse } from 'next/server'
import { getDealsCurrentState } from '@/lib/metrics/funnel'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/metrics/current-state?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Devuelve cuántos deals creados en el rango están AHORA en cada stage.
 * Coincide 1:1 con las cards del CRM (lib/supabase/deals.ts stageCounts).
 * No filtra por origin — incluye todos los deals igual que el CRM.
 */
export async function GET(req: NextRequest) {
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
    const data = await getDealsCurrentState({ from, to })
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    console.error('[api/metrics/current-state]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
