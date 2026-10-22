import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cargarInforme, respuestaDeError } from '@/lib/informes/rutas'
import { marcarInformeListo } from '@/lib/informes/servicio'
import { volverABorrador } from '@/lib/informes/datos'

export const dynamic = 'force-dynamic'

const cuerpo = z.object({ pdfPath: z.string().max(300) }).strict()

/** "Marcar como listo": el PDF subido se revisa por sus bytes y el informe queda cerrado. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  const p = cuerpo.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Falta el PDF' }, { status: 400 })
  try {
    await marcarInformeListo(c.informe, p.data.pdfPath, c.userId)
    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    return respuestaDeError(e, 'marcar listo')
  }
}

/** "Volver a borrador" para corregir un informe ya listo. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  try {
    if (!(await volverABorrador(c.informe.id))) return NextResponse.json({ error: 'El informe ya era un borrador' }, { status: 409 })
    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    return respuestaDeError(e, 'volver a borrador')
  }
}
