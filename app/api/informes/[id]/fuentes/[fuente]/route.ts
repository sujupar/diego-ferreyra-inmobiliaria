import { NextRequest, NextResponse } from 'next/server'
import { cargarInforme, respuestaDeError } from '@/lib/informes/rutas'
import { refrescarFuente } from '@/lib/informes/servicio'
import { FUENTES, type NombreFuente } from '@/lib/informes/tipos'

export const dynamic = 'force-dynamic'

/**
 * Trae UNA fuente automática (regla dura de Netlify: una integración lenta por request). La
 * pantalla pide las pendientes de a una y muestra el progreso; "Reintentar" vuelve a pedir una.
 * Una fuente caída NO da error HTTP: responde 200 con `estado: 'error'` y su motivo.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; fuente: string }> }) {
  const { id, fuente } = await params
  if (!(FUENTES as readonly string[]).includes(fuente)) return NextResponse.json({ error: 'Fuente desconocida' }, { status: 404 })
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  try {
    return NextResponse.json({ data: await refrescarFuente(c.informe, fuente as NombreFuente, new Date()) })
  } catch (e) {
    return respuestaDeError(e, `traer fuente ${fuente}`)
  }
}
