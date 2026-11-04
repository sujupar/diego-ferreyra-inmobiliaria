import { NextRequest, NextResponse } from 'next/server'
import { conPermisoMetricas, prohibido } from '@/lib/metrics/panel/permiso'
import { cargarHitos, db } from '@/lib/metrics/panel/servidor'
import { validarHito } from '@/lib/metrics/panel/validar'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await conPermisoMetricas())) return prohibido()
  try { return NextResponse.json(await cargarHitos(db())) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Error interno' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const user = await conPermisoMetricas()
  if (!user) return prohibido()
  const v = validarHito(await req.json().catch(() => ({})))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  const { data, error } = await db().from('hitos_metricas').insert({ ...v.hito, created_by: user.id }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
