import { NextRequest, NextResponse } from 'next/server'
import { conPermisoMetricas, prohibido } from '@/lib/metrics/panel/permiso'
import { armarPanel } from '@/lib/metrics/panel/servidor'
import type { Agrupar, Comparar } from '@/lib/metrics/panel/rango'

export const dynamic = 'force-dynamic'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** GET /api/metrics/panel?desde&hasta&comparar&agrupar&vista — todo el panel menos el alcance. */
export async function GET(req: NextRequest) {
  if (!(await conPermisoMetricas())) return prohibido()
  const sp = req.nextUrl.searchParams
  const desde = sp.get('desde') ?? '', hasta = sp.get('hasta') ?? ''
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: 'Fechas inválidas.' }, { status: 400 })
  }
  const comparar = (['anterior', 'anio_pasado', 'ninguno'].includes(sp.get('comparar') ?? '') ? sp.get('comparar') : 'anterior') as Comparar
  const agrupar = (['dia', 'semana', 'mes'].includes(sp.get('agrupar') ?? '') ? sp.get('agrupar') : 'semana') as Agrupar
  const vista = sp.get('vista') === 'cohorte' ? 'cohorte' : 'eventos'
  try {
    return NextResponse.json(await armarPanel({ rango: { desde, hasta }, comparar, agrupar, vista }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    console.error('[api/metrics/panel]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
