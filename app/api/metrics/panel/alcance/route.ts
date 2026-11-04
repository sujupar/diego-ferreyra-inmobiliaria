import { NextRequest, NextResponse } from 'next/server'
import { conPermisoMetricas, prohibido } from '@/lib/metrics/panel/permiso'
import { alcance } from '@/lib/metrics/panel/servidor'
import { hoyArgentina } from '@/lib/metrics/panel/rango'

export const dynamic = 'force-dynamic'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** GET /api/metrics/panel/alcance?desde&hasta — personas únicas alcanzadas por embudo (Meta). */
export async function GET(req: NextRequest) {
  if (!(await conPermisoMetricas())) return prohibido()
  const desde = req.nextUrl.searchParams.get('desde') ?? '', hasta = req.nextUrl.searchParams.get('hasta') ?? ''
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: 'Fechas inválidas.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await alcance({ desde, hasta }, hoyArgentina()))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error interno' }, { status: 500 })
  }
}
