import { NextRequest, NextResponse } from 'next/server'
import { accesoMetricas } from '@/lib/metrics/panel/permiso'
import { db } from '@/lib/metrics/panel/servidor'
import { validarGasto } from '@/lib/metrics/panel/validar'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  const { id } = await params
  const sb = db()
  const { data: actual } = await sb.from('gastos_fijos').select('concepto, tipo, monto_usd, desde, hasta, a_confirmar, notas').eq('id', id).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'No existe ese gasto.' }, { status: 404 })
  const v = validarGasto({ ...actual, ...(await req.json().catch(() => ({}))) })
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await sb.from('gastos_fijos').update(v.gasto).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  const { id } = await params
  const { error } = await db().from('gastos_fijos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
