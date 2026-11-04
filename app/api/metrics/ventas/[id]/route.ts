import { NextRequest, NextResponse } from 'next/server'
import { accesoMetricas } from '@/lib/metrics/panel/permiso'
import { db } from '@/lib/metrics/panel/servidor'
import { limpiarVenta, validarVenta } from '@/lib/metrics/panel/reparto'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  const { user } = acceso
  const { id } = await params
  const sb = db()
  const { data: actual } = await sb.from('ventas').select('*').eq('id', id).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'No existe esa venta.' }, { status: 404 })
  const cambios = limpiarVenta(await req.json().catch(() => ({})))
  const err = validarVenta({ ...actual, ...cambios })
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const { data, error } = await sb.from('ventas').update({ ...cambios, updated_by: user.id }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

/** Borra una venta cargada por error. Una operación que se cayó se marca "caida", no se borra. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  const { id } = await params
  const { error } = await db().from('ventas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
