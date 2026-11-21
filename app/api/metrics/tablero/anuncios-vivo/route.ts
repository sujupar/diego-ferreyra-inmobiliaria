import { NextRequest, NextResponse } from 'next/server'
import { accesoMetricas } from '@/lib/metrics/panel/permiso'
import { anunciosDelPeriodo } from '@/lib/metrics/tablero/meta-vivo'

export const dynamic = 'force-dynamic'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/metrics/tablero/anuncios-vivo?desde&hasta — cada anuncio de la campaña
 * de tasación en el período, con su estado de hoy y su vista previa (Meta en
 * vivo, caché 30 min). Si Meta falla responde `{ disponible: false }` y la tabla
 * dice "no disponible": el resto del Tablero no depende de esto.
 */
export async function GET(req: NextRequest) {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  const desde = req.nextUrl.searchParams.get('desde') ?? '', hasta = req.nextUrl.searchParams.get('hasta') ?? ''
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) return NextResponse.json({ error: 'Fechas inválidas.' }, { status: 400 })
  return NextResponse.json(await anunciosDelPeriodo({ desde, hasta }))
}
