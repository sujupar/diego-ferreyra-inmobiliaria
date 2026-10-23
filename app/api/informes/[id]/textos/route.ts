import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cargarInforme, respuestaDeError } from '@/lib/informes/rutas'
import { escribirTextos } from '@/lib/informes/servicio'

export const dynamic = 'force-dynamic'

const cuerpo = z.object({ forzar: z.boolean().optional() }).strict()

/**
 * La plataforma escribe los textos del informe (UNA llamada al modelo, regla de Netlify). `forzar` reemplaza
 * también lo que Paula corrigió ("Volver a escribir todo"); sin él, lo corregido se respeta.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  const p = cuerpo.safeParse(await req.json().catch(() => ({})))
  if (!p.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  try {
    const informe = await escribirTextos(c.informe, new Date(), p.data.forzar ?? false)
    return NextResponse.json({ data: { manual: informe.manual } })
  } catch (e) {
    return respuestaDeError(e, 'escribir textos')
  }
}
