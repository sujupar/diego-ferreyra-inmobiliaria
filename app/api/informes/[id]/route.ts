import { NextRequest, NextResponse } from 'next/server'
import { cargarInforme, respuestaDeError } from '@/lib/informes/rutas'
import { vistaDelInforme } from '@/lib/informes/servicio'
import { guardarCambios } from '@/lib/informes/datos'
import { sanearCambios } from '@/lib/informes/sanear'

export const dynamic = 'force-dynamic'

/** El informe completo para la pantalla (y para armar el PDF en el navegador). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  try {
    return NextResponse.json({ data: await vistaDelInforme(c.informe) })
  } catch (e) {
    return respuestaDeError(e, 'leer informe')
  }
}

/** Lo que carga Paula (números, información) y las competidoras. Validado en `sanear.ts`. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await cargarInforme(id)
  if (!c.ok) return c.res
  const s = sanearCambios(await req.json().catch(() => null))
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400 })
  try {
    if (!(await guardarCambios(c.informe.id, s.cambios))) {
      return NextResponse.json({ error: 'El informe ya está listo. Volvelo a borrador para cambiarlo.' }, { status: 409 })
    }
    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    return respuestaDeError(e, 'guardar informe')
  }
}
