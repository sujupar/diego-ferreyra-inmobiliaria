import { NextRequest, NextResponse } from 'next/server'
import { accesoMetricas } from '@/lib/metrics/panel/permiso'
import { cargarHitos, db, faltaColumna } from '@/lib/metrics/panel/servidor'
import { validarHito } from '@/lib/metrics/panel/validar'

export const dynamic = 'force-dynamic'

export async function GET() {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  try { return NextResponse.json(await cargarHitos(db())) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Error interno' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  const acceso = await accesoMetricas()
  if ('respuesta' in acceso) return acceso.respuesta
  const { user } = acceso
  const v = validarHito(await req.json().catch(() => ({})))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  const base = { ...v.hito, created_by: user.id }
  const conAjuste = Object.keys(v.ajuste).length > 0
  const r = await db().from('hitos_metricas').insert({ ...base, ...v.ajuste }).select().single()
  if (!r.error) return NextResponse.json(r.data)
  // Sin la migración del Tablero (20261120000001) las columnas del ajuste no existen:
  // se guarda el cambio igual y se avisa qué quedó afuera.
  if (conAjuste && faltaColumna(r.error)) {
    const r2 = await db().from('hitos_metricas').insert(base).select().single()
    if (r2.error) return NextResponse.json({ error: r2.error.message }, { status: 400 })
    return NextResponse.json({ ...r2.data, aviso: 'Se guardó el cambio, pero sin lo que se busca, la meta ni la fecha de decisión: falta aplicar la migración de la base.' })
  }
  return NextResponse.json({ error: r.error.message }, { status: 400 })
}
