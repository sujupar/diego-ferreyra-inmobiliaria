import { NextRequest, NextResponse } from 'next/server'
import { conPermisoMetricas, prohibido } from '@/lib/metrics/panel/permiso'
import { cargarGastos, db } from '@/lib/metrics/panel/servidor'
import { validarGasto } from '@/lib/metrics/panel/validar'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await conPermisoMetricas())) return prohibido()
  try { return NextResponse.json(await cargarGastos(db())) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Error interno' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  if (!(await conPermisoMetricas())) return prohibido()
  const v = validarGasto(await req.json().catch(() => ({})))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await db().from('gastos_fijos').insert(v.gasto).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
