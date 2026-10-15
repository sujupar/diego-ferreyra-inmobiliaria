import { NextRequest, NextResponse } from 'next/server'
import * as datos from '@/lib/visitas/encuesta/datos'
import { esTokenEncuesta } from '@/lib/visitas/encuesta/link'
import { nombreDeDescarga, SEGUNDOS_URL_DESCARGA } from '@/lib/visitas/encuesta/regalo'

export const dynamic = 'force-dynamic'

/**
 * Descarga del regalo (adenda §11.2): SOLO con una encuesta terminada, y siempre con una URL
 * firmada NUEVA de 10 minutos (el archivo vive en un bucket privado). El email del regalo apunta
 * acá, por eso sirve aunque pasen días. Respuestas en texto plano: es una navegación, no un fetch.
 */
function texto(mensaje: string, status: number) {
  return new NextResponse(mensaje, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!esTokenEncuesta(token)) return texto('Este link no está disponible.', 404)
  try {
    const ec = await datos.leerEncuestaConVisita({ token })
    // Visita reabierta (se marcó "Se realizó" por error): el mismo 404 amable que el resto del link.
    if (!ec || ec.visita.status !== 'completed' || !ec.encuesta.completed_at) return texto('Este link no está disponible.', 404)
    const regalo = await datos.leerRegalo(ec.visita.property_id)
    if (!regalo) return texto('Esta propiedad ya no tiene material para descargar.', 404)
    const url = await datos.urlFirmada(regalo.archivoPath, SEGUNDOS_URL_DESCARGA, nombreDeDescarga(regalo.archivoNombre))
    if (!url) return texto('No pudimos preparar la descarga. Probá de nuevo en un rato.', 503)
    await datos.marcarRegaloDescargado(ec.encuesta.id)
    const res = NextResponse.redirect(url, 302)
    res.headers.set('cache-control', 'no-store')
    res.headers.set('referrer-policy', 'no-referrer')
    return res
  } catch (e) {
    console.error('[GET /api/public/encuesta/[token]/regalo]', e)
    return texto('No pudimos preparar la descarga. Probá de nuevo en un rato.', 500)
  }
}
