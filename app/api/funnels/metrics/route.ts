import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'

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
        url: `${APP_URL}/tasacion-directa`,
        visitFunnelType: 'tasacion',
        submissionFunnel: 'tasacion',
      },
      {
        key: 'clase' as const,
        label: 'Clase Gratuita',
        url: `${APP_URL}/vsl-clase-propietarios`,
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

    return NextResponse.json({ from, to, funnels })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    console.error('[api/funnels/metrics]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
