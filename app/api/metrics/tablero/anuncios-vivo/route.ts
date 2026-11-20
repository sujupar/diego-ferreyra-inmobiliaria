import { NextResponse } from 'next/server'
import { accesoMetricas } from '@/lib/metrics/panel/permiso'
import { anunciosEnVivo } from '@/lib/metrics/tablero/meta-vivo'

export const dynamic = 'force-dynamic'

/**
 * GET /api/metrics/tablero/anuncios-vivo — cada anuncio de la estructura actual
 * (Meta en vivo, caché 30 min). Nunca devuelve error: si Meta falla, responde
 * `{ disponible: false }` y la tabla dice "no disponible".
 */
export async function GET() {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  return NextResponse.json(await anunciosEnVivo())
}
