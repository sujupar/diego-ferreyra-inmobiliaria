import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { cargarInforme, respuestaDeError } from '@/lib/informes/rutas'
import { abrirCandidata } from '@/lib/informes/servicio'

export const dynamic = 'force-dynamic'

const cuerpo = z.object({ url: z.string().url().max(1000) }).strict()

/** Abre UNA candidata para leer disposición y estado. Solo avisos que encontró la búsqueda del informe. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  const p = cuerpo.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Falta el aviso' }, { status: 400 })
  try {
    return NextResponse.json({ data: await abrirCandidata(c.informe, p.data.url) })
  } catch (e) {
    return respuestaDeError(e, 'abrir candidata')
  }
}
