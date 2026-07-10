import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PAGES = new Set(['tasacion', 'clase'])

interface SectionRow { page: string; section: string; segment: string; stage: string | null; device: string; reached: number; avg_visible_ms: number; clicks: number }
interface TotalRow { page: string; segment: string; stage: string | null; device: string; sessions: number; avg_scroll: number }
interface GridRow { page: string; section: string; segment: string; device: string; x_bin: number; y_bin: number; clicks: number; rage: number }

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, string>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    console.warn(`[funnels/heatmap] ${fn}: ${error.message}`)
    return []
  }
  return (data ?? []) as T[]
}

/**
 * GET /api/funnels/heatmap?page=tasacion&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Datos del mapa de calor de UNA landing para el visor sobre-la-página del
 * panel Embudos. Solo admin/dueno (mismo gate que /api/funnels/metrics).
 */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || (user.profile.role !== 'admin' && user.profile.role !== 'dueno')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const page = sp.get('page') ?? ''
  const from = sp.get('from')
  const to = sp.get('to')
  if (!PAGES.has(page)) {
    return NextResponse.json({ error: 'page inválida' }, { status: 400 })
  }
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return NextResponse.json({ error: 'from/to requeridos como YYYY-MM-DD' }, { status: 400 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const startIso = `${from}T00:00:00Z`
    const endEx = new Date(`${to}T00:00:00Z`)
    endEx.setUTCDate(endEx.getUTCDate() + 1)
    const args = { p_from: startIso, p_to: endEx.toISOString() }

    const [totals, sections, grid] = await Promise.all([
      rpc<TotalRow>(supabase, 'heatmap_session_totals', args),
      rpc<SectionRow>(supabase, 'heatmap_section_stats', args),
      rpc<GridRow>(supabase, 'heatmap_clicks_grid', args),
    ])

    return NextResponse.json({
      page,
      from,
      to,
      totals: totals.filter((r) => r.page === page),
      sections: sections.filter((r) => r.page === page),
      grid: grid.filter((r) => r.page === page),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    console.error('[api/funnels/heatmap]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
