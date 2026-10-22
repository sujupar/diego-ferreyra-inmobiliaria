import { NextRequest, NextResponse } from 'next/server'
import { cargarInforme, respuestaDeError } from '@/lib/informes/rutas'
import { prepararPdf } from '@/lib/informes/servicio'

export const dynamic = 'force-dynamic'

/**
 * Prepara la subida del PDF (lo genera el navegador, como el de tasación). Solo si no falta nada:
 * el mismo control se repite al confirmar en `/listo`.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  try {
    return NextResponse.json({ data: await prepararPdf(c.informe) })
  } catch (e) {
    return respuestaDeError(e, 'preparar PDF')
  }
}
