import { NextRequest, NextResponse } from 'next/server'
import { cargarInforme, respuestaDeError } from '@/lib/informes/rutas'
import { buscarCompetencia } from '@/lib/informes/servicio'

export const dynamic = 'force-dynamic'

/**
 * Busca competidoras en UN portal (una integración lenta por pedido, regla de Netlify). Un portal caído NO da
 * error HTTP: responde 200 con `estado: 'error'` y su motivo, para que la pantalla lo diga y siga con el otro.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; portal: string }> }) {
  const { id, portal } = await params
  if (portal !== 'argenprop' && portal !== 'mercadolibre') return NextResponse.json({ error: 'Portal desconocido' }, { status: 404 })
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  try {
    return NextResponse.json({ data: await buscarCompetencia(c.informe, portal, new Date()) })
  } catch (e) {
    return respuestaDeError(e, `buscar competencia en ${portal}`)
  }
}
