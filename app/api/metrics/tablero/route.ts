import { NextRequest, NextResponse } from 'next/server'
import { accesoMetricas } from '@/lib/metrics/panel/permiso'
import { armarTablero } from '@/lib/metrics/tablero/servidor'
import type { Comparar } from '@/lib/metrics/panel/rango'

export const dynamic = 'force-dynamic'

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const COMPARAR: Comparar[] = ['mes_anterior', 'anterior', 'anio_pasado', 'ninguno']

/** GET /api/metrics/tablero?desde&hasta&comparar — el Tablero de /metrics (sin Meta en vivo). */
export async function GET(req: NextRequest) {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  const sp = req.nextUrl.searchParams
  const desde = sp.get('desde') ?? '', hasta = sp.get('hasta') ?? ''
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: 'Fechas inválidas.' }, { status: 400 })
  }
  const c = sp.get('comparar') as Comparar | null
  const comparar: Comparar = c && COMPARAR.includes(c) ? c : 'mes_anterior'
  try {
    return NextResponse.json(await armarTablero({ rango: { desde, hasta }, comparar }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    console.error('[api/metrics/tablero]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
