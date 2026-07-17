import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Dominio PÚBLICO de las landings (el de los anuncios de Meta, migrado de GHL
// 2026-07-17). Distinto de NEXT_PUBLIC_APP_URL (dominio del dashboard).
const FUNNEL_PUBLIC_BASE =
  process.env.NEXT_PUBLIC_FUNNEL_PUBLIC_URL ?? 'https://inmobiliariadiegoferreyra.com'

// Cliente admin SIN tipar: las tablas de funnel no están en el tipo Database.
type AdminClient = SupabaseClient

type ByDayRow = { day: string; visits: number; conversions: number }

/**
 * Construye la lista de días (inclusive) entre `from` y `to` como 'YYYY-MM-DD'.
 * Iteramos en UTC para evitar saltos por DST/zona horaria.
 */
function dayRange(from: string, to: string): string[] {
  const days: string[] = []
  const cur = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return days
}

/**
 * Agrupa por fecha (columna de timestamp) las filas de una tabla en el rango,
 * usando paginación para no quedar limitados por el cap default de Supabase.
 *
 * Devuelve un Map 'YYYY-MM-DD' → count y el total.
 */
async function countByDay(
  supabase: AdminClient,
  table: string,
  tsColumn: string,
  filterColumn: string,
  filterValue: string,
  from: string,
  to: string,
): Promise<{ total: number; byDay: Map<string, number> }> {
  const byDay = new Map<string, number>()
  let total = 0

  // Rango inclusive: [from 00:00, to+1 00:00) en UTC.
  const startIso = `${from}T00:00:00Z`
  const endExclusive = new Date(`${to}T00:00:00Z`)
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
  const endIso = endExclusive.toISOString()

  const PAGE = 1000
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(tsColumn)
      .eq(filterColumn, filterValue)
      .gte(tsColumn, startIso)
      .lt(tsColumn, endIso)
      .order(tsColumn, { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data ?? []) as unknown as Array<Record<string, string>>
    for (const row of rows) {
      const ts = row[tsColumn]
      if (!ts) continue
      const day = ts.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
      total++
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }

  return { total, byDay }
}

function pct(conversions: number, visits: number): number {
  if (visits <= 0) return 0
  return Math.round((conversions / visits) * 10000) / 100
}

// --- Fase 4: tipos de los RPC de agregación + breakdown por campaña ---
interface VideoStatRow {
  funnel: string
  video_key: string
  segment: 'no_registrado' | 'registrado' | string
  stage: string | null
  viewers: number
  avg_max_percent: number | null
  avg_attention: number | null
  completed: number
  q25: number; q50: number; q75: number; q95: number; q100: number
}
interface VisitCampRow { funnel_type: string; campaign: string; visits: number }
interface ConvCampRow { funnel: string; campaign: string; conversions: number }
interface SpendRow { campaign_name: string | null; spend: number | null }
// v1: histograma de profundidad (dónde dejó de ver cada uno)
interface RetentionRow { funnel: string; video_key: string; segment: string; stage: string | null; percent: number; viewers: number }
// v2: retención momento a momento (qué % vio cada tramo del video)
interface HeatmapRow { funnel: string; video_key: string; segment: string; stage: string | null; bucket: number; viewers: number }
// Mapa de calor de página (interno)
interface HeatSectionRow { page: string; section: string; segment: string; stage: string | null; device: string; reached: number; avg_visible_ms: number; clicks: number }
interface HeatTotalRow { page: string; segment: string; stage: string | null; device: string; sessions: number; avg_scroll: number }
interface HeatGridRow { page: string; section: string; segment: string; device: string; x_bin: number; y_bin: number; clicks: number; rage: number }

/** Llama un RPC de agregación; si la migración aún no corrió, degrada a []. */
async function safeRpc<T>(supabase: AdminClient, fn: string, args: Record<string, string>): Promise<T[]> {
  try {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) {
      console.warn(`[funnels/metrics] ${fn}: ${error.message}`)
      return []
    }
    return (data ?? []) as T[]
  } catch (e) {
    console.warn(`[funnels/metrics] ${fn} threw`, e)
    return []
  }
}

/**
 * GET /api/funnels/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Métricas de los embudos de landing (Tasación Directa / Clase Gratuita):
 * visitas (landing_page_visits) vs conversiones (funnel_lead_submissions) en el
 * rango [from, to] inclusive, con totales + serie por día.
 *
 * Solo admin/dueno. Usa service-role inline porque funnel_lead_submissions no
 * tiene políticas RLS (solo accesible vía service-role).
 */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || (user.profile.role !== 'admin' && user.profile.role !== 'dueno')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

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
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const FUNNELS = [
      {
        key: 'tasacion' as const,
        label: 'Tasación Directa',
        url: `${FUNNEL_PUBLIC_BASE}/tasacion-directa`,
        visitFunnelType: 'tasacion',
        submissionFunnel: 'tasacion',
      },
      {
        key: 'clase' as const,
        label: 'Clase Gratuita',
        url: `${FUNNEL_PUBLIC_BASE}/vsl-clase-propietarios`,
        visitFunnelType: 'clase_gratuita',
        submissionFunnel: 'clase',
      },
    ]

    const days = dayRange(from, to)

    const funnels = await Promise.all(
      FUNNELS.map(async (f) => {
        const [visitsAgg, convAgg] = await Promise.all([
          countByDay(supabase, 'landing_page_visits', 'visited_at', 'funnel_type', f.visitFunnelType, from, to),
          countByDay(supabase, 'funnel_lead_submissions', 'created_at', 'funnel', f.submissionFunnel, from, to),
        ])

        const byDay: ByDayRow[] = days.map((day) => ({
          day,
          visits: visitsAgg.byDay.get(day) ?? 0,
          conversions: convAgg.byDay.get(day) ?? 0,
        }))

        return {
          key: f.key,
          label: f.label,
          url: f.url,
          visits: visitsAgg.total,
          conversions: convAgg.total,
          conversionPct: pct(convAgg.total, visitsAgg.total),
          byDay,
        }
      }),
    )

    // --- Fase 4: analítica de video (por segmento/etapa) + breakdown por campaña ---
    const startIso = `${from}T00:00:00Z`
    const endEx = new Date(`${to}T00:00:00Z`)
    endEx.setUTCDate(endEx.getUTCDate() + 1)
    const endIso = endEx.toISOString()
    const rpcArgs = { p_from: startIso, p_to: endIso }

    const [videoRows, retentionAll, heatmapAll, heatSections, heatTotals, heatGrid, visitCampaigns, convCampaigns, spendRows] = await Promise.all([
      safeRpc<VideoStatRow>(supabase, 'funnel_video_stats', rpcArgs),
      safeRpc<RetentionRow>(supabase, 'funnel_video_retention', rpcArgs),
      safeRpc<HeatmapRow>(supabase, 'funnel_video_heatmap', rpcArgs),
      safeRpc<HeatSectionRow>(supabase, 'heatmap_section_stats', rpcArgs),
      safeRpc<HeatTotalRow>(supabase, 'heatmap_session_totals', rpcArgs),
      safeRpc<HeatGridRow>(supabase, 'heatmap_clicks_grid', rpcArgs),
      safeRpc<VisitCampRow>(supabase, 'funnel_campaign_visits', rpcArgs),
      safeRpc<ConvCampRow>(supabase, 'funnel_campaign_conversions', rpcArgs),
      (async (): Promise<SpendRow[]> => {
        try {
          const { data } = await supabase
            .from('meta_ads_daily')
            .select('campaign_name, spend')
            .gte('date', from)
            .lte('date', to)
          return (data ?? []) as SpendRow[]
        } catch {
          return []
        }
      })(),
    ])

    const spendByCampaign = new Map<string, number>()
    for (const r of spendRows) {
      const name = (r.campaign_name ?? '').trim()
      if (!name) continue
      spendByCampaign.set(name, (spendByCampaign.get(name) ?? 0) + (Number(r.spend) || 0))
    }

    const enriched = funnels.map((f) => {
      const meta = FUNNELS.find((x) => x.key === f.key)!
      const videoRowsForFunnel = videoRows.filter((r) => r.funnel === f.key)

      const campMap = new Map<string, { campaign: string; visits: number; conversions: number; spend: number }>()
      const getC = (name: string) => {
        let c = campMap.get(name)
        if (!c) {
          c = { campaign: name, visits: 0, conversions: 0, spend: 0 }
          campMap.set(name, c)
        }
        return c
      }
      for (const v of visitCampaigns) {
        if (v.funnel_type === meta.visitFunnelType) getC(v.campaign).visits += Number(v.visits) || 0
      }
      for (const cv of convCampaigns) {
        if (cv.funnel === meta.submissionFunnel) getC(cv.campaign).conversions += Number(cv.conversions) || 0
      }
      for (const c of campMap.values()) {
        if (c.campaign !== '(directo)') c.spend = spendByCampaign.get(c.campaign) ?? 0
      }

      const byCampaign = [...campMap.values()]
        .map((c) => ({
          campaign: c.campaign,
          visits: c.visits,
          conversions: c.conversions,
          pct: pct(c.conversions, c.visits),
          spend: Math.round(c.spend * 100) / 100,
          cpa: c.conversions > 0 && c.spend > 0 ? Math.round((c.spend / c.conversions) * 100) / 100 : null,
        }))
        .sort((a, b) => b.visits - a.visits || b.conversions - a.conversions)
        .slice(0, 25)

      return {
        ...f,
        videoRows: videoRowsForFunnel,
        retentionRows: retentionAll.filter((r) => r.funnel === f.key),
        heatmapRows: heatmapAll.filter((r) => r.funnel === f.key),
        byCampaign,
        pageHeatSections: heatSections.filter((r) => r.page === f.key),
        pageHeatTotals: heatTotals.filter((r) => r.page === f.key),
        pageHeatGrid: heatGrid.filter((r) => r.page === f.key),
      }
    })

    return NextResponse.json({ from, to, funnels: enriched })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    console.error('[api/funnels/metrics]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
