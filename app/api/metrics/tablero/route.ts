import { NextRequest, NextResponse } from 'next/server'
import { accesoMetricas } from '@/lib/metrics/panel/permiso'
import { armarTablero, MODOS_COMPARACION, type ModoComparacion } from '@/lib/metrics/tablero/servidor'

export const dynamic = 'force-dynamic'

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const MES = /^\d{4}-(0[1-9]|1[0-2])$/

/** GET /api/metrics/tablero?desde&hasta&comparar[&mes=YYYY-MM] — el Tablero de /metrics (sin Meta en vivo). */
export async function GET(req: NextRequest) {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  const sp = req.nextUrl.searchParams
  const desde = sp.get('desde') ?? '', hasta = sp.get('hasta') ?? ''
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: 'Fechas inválidas.' }, { status: 400 })
  }
  const c = sp.get('comparar') as ModoComparacion | null
  const comparar: ModoComparacion = c && MODOS_COMPARACION.includes(c) ? c : 'mes_anterior'
  const mes = sp.get('mes')
  if (comparar === 'mes' && (!mes || !MES.test(mes))) {
    return NextResponse.json({ error: 'Elegí un mes válido para comparar.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await armarTablero({ rango: { desde, hasta }, comparar, mes: comparar === 'mes' ? mes : null }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    console.error('[api/metrics/tablero]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
