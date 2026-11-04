import { NextRequest, NextResponse } from 'next/server'
import { conPermisoMetricas, prohibido } from '@/lib/metrics/panel/permiso'
import { cargarBlue, cargarVentas, db } from '@/lib/metrics/panel/servidor'
import { calcularVenta, limpiarVenta, validarVenta } from '@/lib/metrics/panel/reparto'

export const dynamic = 'force-dynamic'

/** GET /api/metrics/ventas[?property_id=] — las ventas con su cálculo (o la abierta de una propiedad). */
export async function GET(req: NextRequest) {
  if (!(await conPermisoMetricas())) return prohibido()
  const propertyId = req.nextUrl.searchParams.get('property_id')
  try {
    const [todas, blue] = await Promise.all([cargarVentas(db()), cargarBlue()])
    const ventas = propertyId ? todas.filter(v => v.property_id === propertyId && v.estado !== 'caida') : todas
    return NextResponse.json(ventas.map(v => ({ venta: v, calc: calcularVenta(v, v.reservada_en ? blue(v.reservada_en) : null) })))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error interno' }, { status: 500 })
  }
}

/** POST /api/metrics/ventas — carga una venta (las que no tienen ficha en la plataforma). */
export async function POST(req: NextRequest) {
  const user = await conPermisoMetricas()
  if (!user) return prohibido()
  const body = limpiarVenta(await req.json().catch(() => ({})))
  const err = validarVenta(body)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const { data, error } = await db().from('ventas').insert({ ...body, created_by: user.id, updated_by: user.id }).select().single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Esa propiedad ya tiene una venta abierta.' : error.message }, { status: 400 })
  return NextResponse.json(data)
}
