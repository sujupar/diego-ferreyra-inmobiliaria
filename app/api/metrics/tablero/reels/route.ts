import { NextRequest, NextResponse } from 'next/server'
import { accesoMetricas } from '@/lib/metrics/panel/permiso'
import { reelsDelTablero } from '@/lib/metrics/tablero/reels-vivo'

export const dynamic = 'force-dynamic'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/metrics/tablero/reels?desde&hasta — reels de Instagram con respuesta
 * automática: lo de toda su vida y lo del período. Va aparte del Tablero porque
 * lee las vistas de Instagram en vivo: si falla, la tabla dice "no disponible".
 */
export async function GET(req: NextRequest) {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  const desde = req.nextUrl.searchParams.get('desde') ?? '', hasta = req.nextUrl.searchParams.get('hasta') ?? ''
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) return NextResponse.json({ error: 'Fechas inválidas.' }, { status: 400 })
  try {
    return NextResponse.json({ disponible: true, ...(await reelsDelTablero({ desde, hasta })) })
  } catch (e) {
    console.warn('[api/metrics/tablero/reels]', e instanceof Error ? e.message : e)
    return NextResponse.json({ disponible: false, motivo: 'No se pudieron leer los reels.' })
  }
}
