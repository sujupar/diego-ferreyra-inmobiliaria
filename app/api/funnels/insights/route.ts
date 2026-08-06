import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'

export const dynamic = 'force-dynamic'

const ORIGENES_MEDIBLES = ['embudo', 'clase_gratuita', 'referido']

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/funnels/insights?from=&to=[&historico=1]
 *
 * Tiempos entre etapas, costo por etapa, volumen por origen y cobertura de
 * asignación de asesor. `historico=1` suma los 464 deals heredados, que por
 * defecto se excluyen porque no tienen historial real de etapas y distorsionan
 * los tiempos.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole('admin', 'dueno')

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!from || !to) {
      return NextResponse.json({ error: 'Faltan from y to (YYYY-MM-DD).' }, { status: 400 })
    }

    const origenes = searchParams.get('historico') === '1'
      ? [...ORIGENES_MEDIBLES, 'historico']
      : ORIGENES_MEDIBLES

    const db = admin()

    const [timings, costs, porOrigen, asesores] = await Promise.all([
      db.rpc('get_funnel_stage_timings', { p_from: from, p_to: to, p_origins: origenes }),
      db.rpc('get_funnel_costs', { p_from: from, p_to: to }),
      db.rpc('get_funnel_volume_by_origin', { p_from: from, p_to: to }),
      db.rpc('get_advisor_coverage', { p_from: from, p_to: to }),
    ])

    if (timings.error) throw timings.error
    if (costs.error) throw costs.error
    if (porOrigen.error) throw porOrigen.error
    if (asesores.error) throw asesores.error

    const cobertura = (asesores.data ?? []) as Array<{ mes: string; total: number; con_asesor: number }>

    return NextResponse.json({
      timings: timings.data ?? [],
      costs: (costs.data ?? [])[0] ?? null,
      porOrigen: porOrigen.data ?? [],
      asesores: {
        total: cobertura.reduce((a, r) => a + Number(r.total), 0),
        con_asesor: cobertura.reduce((a, r) => a + Number(r.con_asesor), 0),
        por_mes: cobertura,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
