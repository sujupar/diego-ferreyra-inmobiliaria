import { NextResponse } from 'next/server'
import { accesoMetricas } from '@/lib/metrics/panel/permiso'
import { cargarPanelVideoBienvenida } from '@/lib/metrics/panel/video-bienvenida-servidor'

export const dynamic = 'force-dynamic'

/** GET /api/metrics/video-bienvenida — panel del video de bienvenida (tasacion-video-bienvenida, D7). */
export async function GET() {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  try {
    return NextResponse.json(await cargarPanelVideoBienvenida(new Date()))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    console.error('[api/metrics/video-bienvenida]', msg)
    return NextResponse.json({ error: 'No se pudo cargar el panel del video de bienvenida.' }, { status: 500 })
  }
}
